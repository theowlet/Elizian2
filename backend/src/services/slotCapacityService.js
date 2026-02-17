/**
 * Slot Capacity Service — Concurrency-Safe Booking
 *
 * Uses venue_time_slots when present; falls back to legacy (restaurant_availability)
 * without breaking existing flows. Does NOT modify operatingHoursService.
 */

const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');

const pool = getPool();

const DEFAULT_CAPACITY = 10;
const DEFAULT_ECHELON_BUFFER = 2;

/**
 * Parse booking_date (YYYY-MM-DD) + booking_time (HH:MM) to a single timestamp (UTC).
 */
function toSlotDatetime(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) return null;
  const [y, m, d] = String(bookingDate).trim().split('-').map(Number);
  const timePart = String(bookingTime).trim();
  const [hh, mm] = timePart.includes(':') ? timePart.split(':').map(Number) : [0, 0];
  const date = new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0, 0));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if venue_time_slots table exists.
 */
async function slotTableExists(client = pool) {
  try {
    const r = await client.query(`SELECT to_regclass('public.venue_time_slots') AS reg`);
    return r.rows[0] && r.rows[0].reg !== null;
  } catch (_) {
    return false;
  }
}

/**
 * Get capacity for a slot (read-only). Use for validation only.
 * Returns null when slot table missing or no row (caller uses legacy).
 */
async function getSlotCapacity(partnerId, bookingDate, bookingTime, client = pool) {
  const slotDt = toSlotDatetime(bookingDate, bookingTime);
  if (!slotDt) return null;

  const exists = await slotTableExists(client);
  if (!exists) return null;

  const result = await client.query(
    `SELECT capacity, booked_count, echelon_buffer
     FROM venue_time_slots
     WHERE partner_id = $1 AND slot_datetime = $2`,
    [partnerId, slotDt]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const capacity = parseInt(row.capacity, 10) || DEFAULT_CAPACITY;
  const booked = parseInt(row.booked_count, 10) || 0;
  const buffer = parseInt(row.echelon_buffer, 10) || DEFAULT_ECHELON_BUFFER;

  return {
    source: 'venue_time_slots',
    capacity,
    booked_count: booked,
    echelon_buffer: buffer,
    maxWithEchelon: capacity + buffer,
    availableCapacity: Math.max(0, capacity - booked),
    availableWithEchelon: Math.max(0, capacity + buffer - booked)
  };
}

/**
 * Ensure a slot row exists (idempotent). Creates with defaults if missing.
 */
async function ensureSlot(client, partnerId, slotDatetime, capacity = DEFAULT_CAPACITY, echelonBuffer = DEFAULT_ECHELON_BUFFER) {
  await client.query(
    `INSERT INTO venue_time_slots (partner_id, slot_datetime, capacity, booked_count, echelon_buffer, updated_at)
     VALUES ($1, $2, $3, 0, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (partner_id, slot_datetime) DO NOTHING`,
    [partnerId, slotDatetime, capacity, echelonBuffer]
  );
}

/**
 * Concurrency-safe reserve: lock row, check capacity (including Echelon buffer), increment booked_count.
 * Call inside an existing transaction; use the same client.
 *
 * @param {Object} client - Transaction client from pool.connect()
 * @param {UUID} partnerId
 * @param {Date} slotDatetime
 * @param {Boolean} isEchelon
 * @param {Number} partySize - default 1
 * @param {Number} capacity - used when creating new slot
 * @param {Number} echelonBuffer - used when creating new slot
 * @returns {Object} { status: 'CONFIRMED' | 'FULL' | 'SLOT_NOT_FOUND', is_priority_override?: boolean }
 */
async function reserveSlot(client, partnerId, slotDatetime, isEchelon = false, partySize = 1, capacity = DEFAULT_CAPACITY, echelonBuffer = DEFAULT_ECHELON_BUFFER) {
  const exists = await slotTableExists(client);
  if (!exists) {
    return { status: 'LEGACY' };
  }

  await ensureSlot(client, partnerId, slotDatetime, capacity, echelonBuffer);

  const lock = await client.query(
    `SELECT capacity, booked_count, echelon_buffer
     FROM venue_time_slots
     WHERE partner_id = $1 AND slot_datetime = $2
     FOR UPDATE`,
    [partnerId, slotDatetime]
  );

  if (lock.rows.length === 0) {
    return { status: 'SLOT_NOT_FOUND' };
  }

  const row = lock.rows[0];
  const cap = parseInt(row.capacity, 10) || DEFAULT_CAPACITY;
  const booked = parseInt(row.booked_count, 10) || 0;
  const buf = parseInt(row.echelon_buffer, 10) || DEFAULT_ECHELON_BUFFER;
  const maxAllowed = isEchelon ? cap + buf : cap;

  if (booked + partySize > maxAllowed) {
    return { status: 'FULL' };
  }

  await client.query(
    `UPDATE venue_time_slots
     SET booked_count = booked_count + $1, updated_at = CURRENT_TIMESTAMP
     WHERE partner_id = $2 AND slot_datetime = $3`,
    [partySize, partnerId, slotDatetime]
  );

  return {
    status: 'CONFIRMED',
    is_priority_override: isEchelon && booked + partySize > cap
  };
}

/**
 * Release capacity when a booking is cancelled (call inside transaction).
 */
async function releaseSlot(client, partnerId, slotDatetime, partySize = 1) {
  const exists = await slotTableExists(client);
  if (!exists) return;

  await client.query(
    `UPDATE venue_time_slots
     SET booked_count = GREATEST(0, booked_count - $1), updated_at = CURRENT_TIMESTAMP
     WHERE partner_id = $2 AND slot_datetime = $3`,
    [partySize, partnerId, slotDatetime]
  );
}

/**
 * Release slot capacity in a separate committed transaction.
 * Use when the main booking transaction is about to roll back but the slot was already reserved,
 * so the decrement must commit independently (e.g. bookingService createBooking rollback).
 */
async function releaseSlotStandalone(partnerId, slotDatetime, partySize = 1) {
  const client = await pool.connect();
  try {
    const exists = await slotTableExists(client);
    if (!exists) return;
    await client.query('BEGIN');
    await client.query(
      `UPDATE venue_time_slots
       SET booked_count = GREATEST(0, booked_count - $1), updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = $2 AND slot_datetime = $3`,
      [partySize, partnerId, slotDatetime]
    );
    await client.query('COMMIT');
    log(`Slot released (standalone) partner=${partnerId} slot=${slotDatetime} partySize=${partySize}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logError('releaseSlotStandalone failed:', err);
  } finally {
    client.release();
  }
}

module.exports = {
  toSlotDatetime,
  slotTableExists,
  getSlotCapacity,
  ensureSlot,
  reserveSlot,
  releaseSlot,
  releaseSlotStandalone,
  DEFAULT_CAPACITY,
  DEFAULT_ECHELON_BUFFER
};
