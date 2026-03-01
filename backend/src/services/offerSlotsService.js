/**
 * Offer Slots Service
 * Generates available time slots for Dining (30-min grid) and Events (partner-defined fixed slots)
 *
 * FIX #6: Eliminated N+1 query pattern — max_redemptions_per_slot is passed from parent, not re-fetched per slot.
 * FIX #8: Returns remaining_seats count in slot response (not just boolean available).
 */

const { getPool } = require('../config/db');
const operatingHoursService = require('./operatingHoursService');
const slotCapacityService = require('./slotCapacityService');
const { log, logError } = require('../utils/logger');

const DEBUG_SLOTS = process.env.DEBUG_OFFER_SLOTS === 'true';

const pool = getPool();

const DEFAULT_SLOT_DURATION = 30;

// Cache event_slots table existence (schema doesn't change at runtime)
let _eventSlotsTableCache = null;

/**
 * Generate 30-min (or configurable) slots between open and close, excluding breaks
 * @param {String} opensAt - "HH:MM"
 * @param {String} closesAt - "HH:MM"
 * @param {Array} breaks - [{start, end}]
 * @param {Number} slotDurationMinutes
 * @returns {Array<String>} ["07:00", "07:30", "08:00", ...]
 */
function generateSlotsFromHours(opensAt, closesAt, breaks = [], slotDurationMinutes = DEFAULT_SLOT_DURATION) {
  if (!opensAt || !closesAt) return [];
  const toMins = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  let openMin = toMins(opensAt);
  let closeMin = toMins(closesAt);
  if (closeMin <= openMin) closeMin += 24 * 60; // overnight

  const slots = [];
  for (let m = openMin; m < closeMin; m += slotDurationMinutes) {
    const slotTime = toHHMM(m);
    const slotEndMin = m + slotDurationMinutes;
    const inBreak = (breaks || []).some((b) => {
      const bs = toMins(b.start);
      const be = toMins(b.end);
      return (m >= bs && m < be) || (slotEndMin > bs && slotEndMin <= be);
    });
    if (!inBreak) slots.push(slotTime);
  }
  return slots;
}

/**
 * Get available slots for a dining deal (from operating hours + slot_duration)
 * FIX #6: maxPerSlot passed from parent, not re-fetched per slot.
 * FIX #8: Returns remaining_seats in each slot.
 */
/** Fallback when partner has no operating hours configured (11:00–23:00) */
const FALLBACK_OPENS = '11:00';
const FALLBACK_CLOSES = '23:00';

async function getDiningSlots(offerId, partnerId, date, partySize = 1, maxPerSlot = null) {
  const hours = await operatingHoursService.getOpeningHoursForDate(partnerId, date);
  if (hours.is_closed) return [];
  // Use partner's operating hours when configured; fallback when not (so slots still show)
  const opensAt = hours.opens_at || FALLBACK_OPENS;
  const closesAt = hours.closes_at || FALLBACK_CLOSES;

  let duration = DEFAULT_SLOT_DURATION;
  try {
    const slotDuration = await pool.query(
      `SELECT COALESCE(slot_duration_minutes, ${DEFAULT_SLOT_DURATION}) as v FROM partners WHERE id = $1`,
      [partnerId]
    );
    const v = slotDuration.rows[0]?.v;
    duration = (v != null ? parseInt(v, 10) : DEFAULT_SLOT_DURATION) || DEFAULT_SLOT_DURATION;
  } catch (_) {
    duration = DEFAULT_SLOT_DURATION;
  }

  const rawSlots = generateSlotsFromHours(opensAt, closesAt, hours.breaks || [], duration);

  const slots = [];
  for (const time of rawSlots) {
    const cap = await checkSlotCapacity(offerId, partnerId, date, time, partySize, maxPerSlot);
    slots.push({ time, available: cap.available, label: time, remaining_seats: cap.remaining });
  }
  if (DEBUG_SLOTS) log(`[offerSlots] dining slots count=${slots.length}, queries saved by passing maxPerSlot`);
  return slots;
}

/**
 * Get available slots for an events deal (from event_slots table)
 * FIX #6: maxPerSlot passed from parent.
 * FIX #8: Returns remaining_seats in each slot.
 * When eventDate is set (experience_metadata.event_date), slots are only returned for that date.
 * Returns { slots, event_date } so frontend can show "Event not available on this day" when date mismatches.
 */
async function getEventSlots(offerId, partnerId, date, partySize = 1, maxPerSlot = null, eventDate = null) {
  const eventDateStr = eventDate != null
    ? (typeof eventDate === 'string' ? eventDate.split('T')[0].split(' ')[0] : (eventDate instanceof Date ? eventDate.toISOString().split('T')[0] : null))
    : null;
  if (eventDateStr) {
    const dateStr = String(date || '').trim();
    if (dateStr && eventDateStr !== dateStr) {
      if (DEBUG_SLOTS) log(`[offerSlots] event date mismatch: event=${eventDateStr} requested=${dateStr}, returning []`);
      return { slots: [], event_date: eventDateStr };
    }
  }
  // Cache table existence check
  if (_eventSlotsTableCache === null) {
    try {
      const tableExists = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_slots'`
      );
      _eventSlotsTableCache = tableExists.rows.length > 0;
    } catch (_) {
      _eventSlotsTableCache = false;
    }
  }
  if (!_eventSlotsTableCache) return { slots: [], event_date: eventDateStr || undefined };

  const result = await pool.query(
    `SELECT id, slot_time, duration_minutes, capacity, label
     FROM event_slots
     WHERE offer_id = $1
     ORDER BY display_order, slot_time`,
    [offerId]
  );

  const slots = [];
  for (const row of result.rows) {
    const timeStr = String(row.slot_time).substring(0, 5);
    // FIX #4 integration: For events, use MIN(maxPerSlot, event_slots.capacity) as effective capacity
    const eventSlotCap = parseInt(row.capacity, 10) || 0;
    const effectiveMaxPerSlot = (maxPerSlot != null && maxPerSlot >= 1)
      ? Math.min(maxPerSlot, eventSlotCap || maxPerSlot)
      : (eventSlotCap > 0 ? eventSlotCap : maxPerSlot);
    const cap = await checkSlotCapacity(offerId, partnerId, date, timeStr, partySize, effectiveMaxPerSlot);
    const label = row.label || `${timeStr} (${row.duration_minutes} min)`;
    slots.push({
      id: row.id,
      time: timeStr,
      duration_minutes: row.duration_minutes,
      capacity: row.capacity,
      label,
      available: cap.available,
      remaining_seats: cap.remaining
    });
  }
  return { slots, event_date: eventDateStr || undefined };
}

/**
 * Check if slot has capacity (deal_slots or venue_time_slots).
 * FIX #6: maxPerSlot is now a parameter, not re-fetched per slot.
 * FIX #8: Returns { available: boolean, remaining: number|null } instead of just boolean.
 *
 * @param {UUID} offerId
 * @param {UUID} partnerId
 * @param {String} date - YYYY-MM-DD
 * @param {String} time - HH:MM
 * @param {Number} partySize
 * @param {Number|null} maxPerSlot - already fetched by parent, null = unlimited per-slot
 * @returns {{ available: boolean, remaining: number|null }}
 */
async function checkSlotCapacity(offerId, partnerId, date, time, partySize, maxPerSlot = null) {
  // Check deal-level slot capacity (deal_slots table)
  if (maxPerSlot != null && maxPerSlot >= 1) {
    const dealCap = await slotCapacityService.getDealSlotCapacity(offerId, date, time, maxPerSlot);
    if (dealCap) {
      return {
        available: dealCap.availableCapacity >= partySize,
        remaining: dealCap.availableCapacity
      };
    }
  }

  // Fallback: venue-level capacity (venue_time_slots)
  const venueCap = await slotCapacityService.getSlotCapacity(partnerId, date, time);
  if (venueCap) {
    return {
      available: venueCap.availableCapacity >= partySize,
      remaining: venueCap.availableCapacity
    };
  }

  // No capacity tracking configured = unlimited
  return { available: true, remaining: null };
}

/**
 * Get available slots for an offer (dining or events)
 */
async function getAvailableSlotsForOffer(offerId, date, partySize = 1) {
  try {
    const offer = await pool.query(
      `SELECT po.id, po.partner_id, po.service_type, po.max_redemptions_per_slot,
              em.event_date, po.start_date, po.end_date
       FROM partner_offers po
       LEFT JOIN experience_metadata em ON em.offer_id = po.id
       WHERE po.id = $1`,
      [offerId]
    );
    if (offer.rows.length === 0) return { slots: [], event_date: undefined };

    const { partner_id, service_type, max_redemptions_per_slot, event_date: eventDateFromMeta, start_date, end_date } = offer.rows[0];
    // Use experience_metadata.event_date, or start_date when start_date === end_date (single-day event)
    let event_date = eventDateFromMeta;
    if (!event_date && start_date && end_date) {
      const toStr = (d) => (d ? (typeof d === 'string' ? d.split('T')[0] : (d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0])) : null);
      const s = toStr(start_date);
      const e = toStr(end_date);
      if (s && e && s === e) event_date = start_date;
    }
    const maxPerSlot = max_redemptions_per_slot ?? null; // FIX #6: Fetch once, pass down
    const st = String(service_type || '').toLowerCase();
    if (DEBUG_SLOTS) log(`[offerSlots] offerId=${offerId} service_type="${service_type}" st="${st}" maxPerSlot=${maxPerSlot}`);

    if (st === 'events') {
      return await getEventSlots(offerId, partner_id, date, partySize, maxPerSlot, event_date);
    }
    if (st === 'dining' || st === 'restaurant') {
      const slots = await getDiningSlots(offerId, partner_id, date, partySize, maxPerSlot);
      return { slots, event_date: undefined };
    }

    if (DEBUG_SLOTS) log(`[offerSlots] no handler for st="${st}", returning []`);
    return { slots: [], event_date: undefined };
  } catch (err) {
    logError('getAvailableSlotsForOffer error:', err);
    return { slots: [], event_date: undefined };
  }
}

module.exports = {
  getAvailableSlotsForOffer,
  getDiningSlots,
  getEventSlots,
  checkSlotCapacity,
  generateSlotsFromHours
};
