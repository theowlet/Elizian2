/**
 * Slot Capacity Service — Concurrency-Safe Booking
 *
 * Uses venue_time_slots when present; falls back to legacy (restaurant_availability)
 * without breaking existing flows. Does NOT modify operatingHoursService.
 *
 * EVENT deals: capacity ALWAYS from event_slots.capacity (single source of truth).
 * Dining/others: use max_redemptions_per_slot or venue_time_slots.
 */

const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');
const eventSlotsRepository = require('../repositories/eventSlotsRepository');

const pool = getPool();

const DEBUG_BOOKING = process.env.DEBUG_BOOKING_CAPACITY === 'true';

const DEFAULT_CAPACITY = 50; // FIX #7: Was 10 — too low for most venues. Events/dining override with actual capacity.
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
 * Check if venue_time_slots table exists (cached after first check — schema doesn't change at runtime).
 */
let _venueSlotTableCache = null;
async function slotTableExists(client = pool) {
  if (_venueSlotTableCache !== null) return _venueSlotTableCache;
  try {
    const r = await client.query(`SELECT to_regclass('public.venue_time_slots') AS reg`);
    _venueSlotTableCache = !!(r.rows[0] && r.rows[0].reg !== null);
    return _venueSlotTableCache;
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
 * Check if deal_slots table exists (cached after first check — schema doesn't change at runtime).
 */
let _dealSlotsTableCache = null;
async function dealSlotsTableExists(client = pool) {
  if (_dealSlotsTableCache !== null) return _dealSlotsTableCache;
  try {
    const r = await client.query(`SELECT to_regclass('public.deal_slots') AS reg`);
    _dealSlotsTableCache = !!(r.rows[0] && r.rows[0].reg !== null);
    return _dealSlotsTableCache;
  } catch (_) {
    return false;
  }
}

/**
 * Get deal slot capacity (for offers with max_redemptions_per_slot).
 * Returns null when table missing or deal has no per-slot limit.
 */
/**
 * Normalize booking time to "HH:MM" for deal_slots lookup.
 * Handles: "19:00", "19:00:00", "7:00 PM", "07:00", etc.
 * Returns '' only for genuinely empty/null input (non-time-based services).
 * FIX #5: Was too fragile — silently collapsed non-HH:MM formats to '', merging all slots.
 */
function normalizeDealTimeSlot(bookingTime) {
  const raw = String(bookingTime || '').trim();
  if (!raw) return '';
  // Handle HH:MM or HH:MM:SS (24-hour)
  const match24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    return `${String(match24[1]).padStart(2, '0')}:${match24[2]}`;
  }
  // Handle 12-hour format: "7:00 PM", "12:30 AM"
  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    if (match12[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (match12[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${match12[2]}`;
  }
  log(`⚠️ normalizeDealTimeSlot: unrecognized format "${raw}", defaulting to ''`);
  return '';
}

/** Normalize slot_time to HH:MM for comparison. */
function toHHMM(t) {
  const s = String(t || '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}` : null;
}

/**
 * Single source of truth for EVENT deal slot capacity.
 * Normalizes time, fetches matching event_slot, returns its capacity.
 * Throws SLOT_NOT_FOUND if no matching slot.
 */
async function getEffectiveEventSlotCapacity(offerId, bookingDate, bookingTime, client = pool) {
  const timeSlot = normalizeDealTimeSlot(bookingTime);
  if (!timeSlot) throw new Error('SLOT_NOT_FOUND');
  const slots = await eventSlotsRepository.listByOffer(offerId, client);
  const slot = slots.find((s) => toHHMM(s.slot_time) === toHHMM(timeSlot));
  if (!slot) throw new Error('SLOT_NOT_FOUND');
  const cap = Math.max(0, parseInt(slot.capacity, 10) || 0);
  return { capacity: cap, timeSlot, slot };
}

async function getDealSlotCapacity(dealId, bookingDate, bookingTime, maxCapacity, client = pool) {
  if (!dealId || !bookingDate || !maxCapacity || maxCapacity < 1) return null;
  const timeSlot = normalizeDealTimeSlot(bookingTime);
  const dateStr = String(bookingDate).trim().substring(0, 10);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const exists = await dealSlotsTableExists(client);
  if (!exists) return null;

  const result = await client.query(
    `SELECT capacity, booked FROM deal_slots
     WHERE deal_id = $1 AND date = $2::date AND COALESCE(time_slot, '') = $3`,
    [dealId, dateStr, timeSlot]
  );

  const capacity = maxCapacity;
  let booked = 0;
  let rowCapacity = null;
  if (result.rows.length > 0) {
    const r = result.rows[0];
    booked = parseInt(r.booked, 10) || 0;
    rowCapacity = parseInt(r.capacity, 10);
  }

  if (DEBUG_BOOKING) {
    log(`[BOOKING DEBUG] getDealSlotCapacity: offer_id=${dealId} booking_date=${bookingDate} booking_time=${bookingTime} normalized_timeSlot=${timeSlot} maxCapacity=${maxCapacity} deal_slots_row(capacity=${rowCapacity}, booked=${booked}) booked+partySize_check=${booked} vs cap=${capacity} dealSlotsTableExists=${exists}`);
  }

  return {
    source: 'deal_slots',
    capacity,
    booked_count: booked,
    availableCapacity: Math.max(0, capacity - booked)
  };
}

/**
 * Reserve in deal_slots (concurrency-safe). Call inside transaction.
 * Creates row if missing. Returns { status: 'CONFIRMED' | 'FULL' }.
 * Throws CAPACITY_SYSTEM_NOT_INITIALIZED if deal_slots table missing.
 */
async function reserveDealSlot(client, dealId, bookingDate, bookingTime, partySize, capacity) {
  if (!dealId || !bookingDate || capacity == null || capacity < 1) return { status: 'FULL' };
  const timeSlot = normalizeDealTimeSlot(bookingTime);
  const dateStr = String(bookingDate).trim().substring(0, 10);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { status: 'FULL' };

  const exists = await dealSlotsTableExists(client);
  if (!exists) {
    logError('deal_slots table missing');
    throw new Error('CAPACITY_SYSTEM_NOT_INITIALIZED');
  }

  // Sync capacity on conflict: existing rows may have stale capacity from old code or race.
  // We always use current capacity from event_slots; never leave wrong capacity in place.
  const timeSlotForUnique = timeSlot || ''; // Use '' for date-only (events) so UNIQUE works
  await client.query(
    `INSERT INTO deal_slots (deal_id, date, time_slot, capacity, booked, is_available)
     VALUES ($1, $2::date, $3, $4, 0, true)
     ON CONFLICT (deal_id, date, time_slot) DO UPDATE SET
       capacity = EXCLUDED.capacity,
       updated_at = CURRENT_TIMESTAMP`,
    [dealId, dateStr, timeSlotForUnique, capacity]
  );

  const lock = await client.query(
    `SELECT capacity, booked FROM deal_slots
     WHERE deal_id = $1 AND date = $2::date AND COALESCE(time_slot, '') = $3
     FOR UPDATE`,
    [dealId, dateStr, timeSlot]
  );

  if (lock.rows.length === 0) return { status: 'FULL' };
  const row = lock.rows[0];
  const cap = parseInt(row.capacity, 10) || capacity;
  const booked = parseInt(row.booked, 10) || 0;

  if (cap <= 0) {
    logError('Invalid capacity for slot', { dealId, dateStr, timeSlot, cap, booked });
    return { status: 'FULL' };
  }

  if (DEBUG_BOOKING) {
    log(`[BOOKING DEBUG] reserveDealSlot: offer_id=${dealId} booking_date=${dateStr} booking_time=${bookingTime} normalized_timeSlot=${timeSlot} effectiveSlotCapacity=${capacity} deal_slots_row(capacity=${cap}, booked=${booked}) booked+partySize=${booked + partySize} vs cap=${cap} dealSlotsTableExists=${exists}`);
  }

  if (booked + partySize > cap) return { status: 'FULL' };

  await client.query(
    `UPDATE deal_slots SET booked = booked + $1, updated_at = CURRENT_TIMESTAMP
     WHERE deal_id = $2 AND date = $3::date AND COALESCE(time_slot, '') = $4`,
    [partySize, dealId, dateStr, timeSlot]
  );

  return { status: 'CONFIRMED' };
}

/** Default timezone for date extraction (matches deal_slots / bookings storage) */
const DEFAULT_TZ = 'Asia/Kolkata';

/**
 * Normalize any date value to YYYY-MM-DD for PostgreSQL.
 * Uses Asia/Kolkata for Date objects so calendar date matches deal_slots (IST).
 */
function toDateString(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: DEFAULT_TZ });
}

/**
 * Release deal slot when booking is cancelled.
 */
async function releaseDealSlot(client, dealId, bookingDate, bookingTime, partySize = 1) {
  if (!dealId || !bookingDate) return;
  const timeSlot = normalizeDealTimeSlot(bookingTime);
  const dateStr = toDateString(bookingDate);
  if (!dateStr) return;
  const exists = await dealSlotsTableExists(client);
  if (!exists) return;

  await client.query(
    `UPDATE deal_slots SET booked = GREATEST(0, booked - $1), updated_at = CURRENT_TIMESTAMP
     WHERE deal_id = $2 AND date = $3::date AND COALESCE(time_slot, '') = $4`,
    [partySize, dealId, dateStr, timeSlot]
  );
}

/**
 * Release deal slot in a separate committed transaction (for rollback/cancel).
 */
async function releaseDealSlotStandalone(dealId, bookingDate, bookingTime, partySize = 1) {
  const client = await pool.connect();
  try {
    const exists = await dealSlotsTableExists(client);
    if (!exists) return;
    await client.query('BEGIN');
    await releaseDealSlot(client, dealId, bookingDate, bookingTime, partySize);
    await client.query('COMMIT');
    log(`Deal slot released (standalone) deal=${dealId} date=${bookingDate} time=${bookingTime} partySize=${partySize}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logError('releaseDealSlotStandalone failed:', err);
  } finally {
    client.release();
  }
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
  toDateString,
  slotTableExists,
  getSlotCapacity,
  ensureSlot,
  reserveSlot,
  releaseSlot,
  releaseSlotStandalone,
  dealSlotsTableExists,
  getDealSlotCapacity,
  getEffectiveEventSlotCapacity,
  reserveDealSlot,
  releaseDealSlot,
  releaseDealSlotStandalone,
  normalizeDealTimeSlot,
  DEFAULT_CAPACITY,
  DEFAULT_ECHELON_BUFFER
};
