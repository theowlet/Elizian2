/**
 * Booking Validation Extension
 *
 * This module contains the MANDATORY validation logic for operating hours and Echelon override.
 * Import and call `validateBookingRequest()` at the START of bookingService.createBooking()
 *
 * CRITICAL RULES:
 * 1. Bookings ONLY within operating hours
 * 2. Echelon overrides capacity, NOT hours
 * 3. Waitlist offered when capacity full + within hours
 */

const operatingHoursService = require('./operatingHoursService');
const reservationRepository = require('../repositories/reservationRepository');
const slotCapacityService = require('./slotCapacityService');
const { log, logError } = require('../../utils/logger');
const { getPool } = require('../config/db');
const { normalizeTierName } = require('../utils/tierNames');
const { parseBookingDateTime: parseBookingDateTimeTZ, DEFAULT_DISPLAY_TZ } = require('../utils/timeService');

const pool = getPool();
// No grace: reject any booking time that is already in the past (prevents "booked at 12:10 for 12:09")
const PAST_BOOKING_GRACE_MINUTES = 0;

/**
 * Parse booking date+time in the partner's timezone.
 * Delegates to timeService.parseBookingDateTime which is server-timezone-independent.
 */
function parseBookingDateTime(bookingDate, bookingTime, timezone = DEFAULT_DISPLAY_TZ) {
  return parseBookingDateTimeTZ(bookingDate, bookingTime, timezone);
}

/**
 * Main validation function - call this FIRST in createBooking()
 *
 * @param {Object} params
 * @param {UUID} params.partner_id
 * @param {UUID} params.user_id
 * @param {String} params.booking_date - YYYY-MM-DD
 * @param {String} params.booking_time - HH:MM
 * @param {Integer} params.party_size
 * @param {String} params.user_tier - e.g., 'Echelon'
 * @param {UUID} params.offer_id - optional, for deal-level slot capacity
 * @param {Integer} params.max_redemptions_per_slot - optional, from offer when deal has per-slot limit (ignored for EVENT)
 * @param {Boolean} params.is_event - when true, capacity MUST come from event_slots; never use venue_time_slots
 * @param {Integer} params.effective_event_slot_capacity - from getEffectiveEventSlotCapacity; single source of truth for EVENT
 * @returns {Object} { allowed: boolean, reason?: string, override_used?: boolean }
 */
async function validateBookingRequest({ partner_id, user_id, booking_date, booking_time, party_size = 1, user_tier, timezone = DEFAULT_DISPLAY_TZ, offer_id, max_redemptions_per_slot, is_event, effective_event_slot_capacity }) {
  const isEchelon = String(user_tier || '').trim().toLowerCase() === 'echelon';
  try {
    // STEP 1: OPERATING HOURS VALIDATION (MANDATORY, NO EXCEPTIONS)
    // ============================================================
    // This check applies to ALL users, including Echelon
    // Echelon can override capacity, NOT opening hours

    if (!booking_date || !booking_time) {
      // No date/time provided - skip hours validation (backward compatibility for non-time-based bookings)
      log(`⚠️ No booking date/time provided - skipping hours validation`);
      return { allowed: true };
    }

    const requestedDateTime = parseBookingDateTime(booking_date, booking_time, timezone);
    if (!requestedDateTime) {
      return {
        allowed: false,
        reason: 'INVALID_BOOKING_DATETIME',
        message: 'Please select a valid booking date and time.',
        can_waitlist: false
      };
    }

    const now = new Date();
    const graceMs = PAST_BOOKING_GRACE_MINUTES * 60 * 1000;
    // Reject if booking datetime is in the past (after optional grace). Use current minute so 12:10:00 allows 12:10.
    const cutoff = now.getTime() - graceMs;
    if (requestedDateTime.getTime() < cutoff) {
      return {
        allowed: false,
        reason: 'BOOKING_TIME_IN_PAST',
        message: 'Selected booking time has already passed. Please choose a current or future time slot.',
        can_waitlist: false
      };
    }

    const hoursValidation = await operatingHoursService.validateBookingTime(
      partner_id,
      booking_date,
      booking_time
    );

    if (!hoursValidation.valid) {
      // REJECT: Outside operating hours
      // Even Echelon tier cannot override this
      log(`🚫 Booking rejected: ${hoursValidation.reason} for partner ${partner_id} at ${booking_date} ${booking_time}`);

      return {
        allowed: false,
        reason: hoursValidation.reason,
        message: hoursValidation.message,
        can_waitlist: false // Never allow waitlist outside hours
      };
    }

    log(`✅ Hours validation passed for ${booking_date} ${booking_time}`);

    // STEP 2: CAPACITY
    // EVENT deals: ALWAYS use event_slots.capacity (effective_event_slot_capacity). Never fall back to venue_time_slots.
    if (is_event && offer_id && effective_event_slot_capacity != null && effective_event_slot_capacity >= 1) {
      const dealCapacity = await slotCapacityService.getDealSlotCapacity(offer_id, booking_date, booking_time, effective_event_slot_capacity);
      if (!dealCapacity) {
        logError('EVENT deal: deal_slots table missing or unavailable');
        throw new Error('CAPACITY_SYSTEM_NOT_INITIALIZED');
      }
      if (dealCapacity.availableCapacity >= party_size) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'CAPACITY_FULL',
        message: 'This time slot is fully booked',
        can_waitlist: true,
        waitlist_info: {
          current_bookings: dealCapacity.booked_count,
          max_capacity: dealCapacity.capacity
        }
      };
    }

    // EVENT without capacity: slot not found — caller should have thrown
    if (is_event && offer_id) {
      throw new Error('SLOT_NOT_FOUND');
    }

    // Non-EVENT: use max_redemptions_per_slot when set
    if (offer_id && max_redemptions_per_slot != null && max_redemptions_per_slot >= 1) {
      const dealCapacity = await slotCapacityService.getDealSlotCapacity(offer_id, booking_date, booking_time, max_redemptions_per_slot);
      if (dealCapacity) {
        if (dealCapacity.availableCapacity >= party_size) {
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: 'CAPACITY_FULL',
          message: 'This time slot is fully booked',
          can_waitlist: true,
          waitlist_info: {
            current_bookings: dealCapacity.booked_count,
            max_capacity: dealCapacity.capacity
          }
        };
      }
    }

    // Fallback: venue_time_slots first, then legacy restaurant_availability (non-EVENT only)
    const slotCapacity = await slotCapacityService.getSlotCapacity(partner_id, booking_date, booking_time);

    if (slotCapacity) {
      if (slotCapacity.availableCapacity >= party_size) {
        return { allowed: true };
      }
      if (isEchelon && slotCapacity.availableWithEchelon >= party_size) {
        log(`👑 Echelon override: allowing booking within buffer for user ${user_id}`);
        return {
          allowed: true,
          override_used: true,
          override_reason: 'Echelon tier capacity override'
        };
      }
      return {
        allowed: false,
        reason: isEchelon ? 'CAPACITY_FULL_EVEN_WITH_ECHELON' : 'CAPACITY_FULL',
        message: 'This time slot is fully booked',
        can_waitlist: true,
        waitlist_info: {
          current_bookings: slotCapacity.booked_count,
          max_capacity: slotCapacity.capacity,
          max_with_echelon: slotCapacity.maxWithEchelon
        }
      };
    }

    const availability = await reservationRepository.checkAvailability(
      partner_id,
      booking_date,
      booking_time
    );

    if (availability && availability.is_blocked) {
      return {
        allowed: false,
        reason: 'SLOT_BLOCKED',
        message: 'This time slot is currently blocked',
        can_waitlist: true
      };
    }

    if (availability && availability.available && availability.availableCapacity >= party_size) {
      return { allowed: true };
    }

    if (isEchelon) {
      const overrideResult = await checkEchelonOverride(partner_id, booking_date, booking_time, party_size);
      if (overrideResult.can_override) {
        log(`👑 Echelon override: allowing booking beyond capacity for user ${user_id}`);
        return {
          allowed: true,
          override_used: true,
          override_reason: 'Echelon tier capacity override'
        };
      }
      return {
        allowed: false,
        reason: 'CAPACITY_FULL_EVEN_WITH_ECHELON',
        message: 'Capacity fully booked (including priority buffer)',
        can_waitlist: true
      };
    }

    // EVENT: should never reach here — capacity source must be resolved
    if (is_event) {
      throw new Error('SLOT_NOT_FOUND');
    }

    // Non-EVENT: if we have availability data showing full, return CAPACITY_FULL
    if (availability && (availability.available === false || (availability.availableCapacity != null && availability.availableCapacity < party_size))) {
      return {
        allowed: false,
        reason: 'CAPACITY_FULL',
        message: 'This time slot is fully booked',
        can_waitlist: true,
        waitlist_info: {
          current_bookings: availability?.bookedCapacity || 0,
          max_capacity: availability?.maxCapacity || 0
        }
      };
    }

    // Non-EVENT: no capacity config — allow unlimited
    return { allowed: true };

  } catch (error) {
    logError('Error in validateBookingRequest:', error);
    throw error;
  }
}

/**
 * Check if Echelon tier can override capacity
 *
 * Echelon gets +10% buffer on capacity
 * Partner can opt-out via allow_echelon_override = false
 */
async function checkEchelonOverride(partner_id, booking_date, booking_time, party_size) {
  try {
    // Get partner's Echelon settings
    const partnerResult = await pool.query(
      `SELECT allow_echelon_override, echelon_capacity_buffer_percent
       FROM partners
       WHERE id = $1`,
      [partner_id]
    );

    if (partnerResult.rows.length === 0) {
      return { can_override: false, reason: 'Partner not found' };
    }

    const partner = partnerResult.rows[0];

    // Check if partner allows Echelon override (default: true)
    if (partner.allow_echelon_override === false) {
      return { can_override: false, reason: 'Partner opted out of Echelon override' };
    }

    // Get current capacity situation
    const availability = await reservationRepository.checkAvailability(
      partner_id,
      booking_date,
      booking_time
    );

    if (!availability) {
      // No slot exists - cannot override
      return { can_override: false, reason: 'Slot not configured' };
    }

    const maxCapacity = availability.maxCapacity || 0;
    const bookedCapacity = availability.bookedCapacity || 0;
    const bufferPercent = partner.echelon_capacity_buffer_percent || 10.0;

    // Calculate max with buffer
    const maxWithBuffer = Math.ceil(maxCapacity * (1 + bufferPercent / 100));

    // Check if booking would fit within buffer
    if (bookedCapacity + party_size <= maxWithBuffer) {
      return {
        can_override: true,
        current_bookings: bookedCapacity,
        max_capacity: maxCapacity,
        max_with_buffer: maxWithBuffer,
        buffer_percent: bufferPercent
      };
    }

    // Even buffer exhausted
    return {
      can_override: false,
      reason: 'Buffer exhausted',
      current_bookings: bookedCapacity,
      max_with_buffer: maxWithBuffer
    };

  } catch (error) {
    logError('Error checking Echelon override:', error);
    return { can_override: false, reason: error.message };
  }
}

/**
 * Helper: Get user's current tier
 */
async function getUserTier(user_id) {
  try {
    const result = await pool.query(
      `SELECT current_tier_name FROM users WHERE id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return 'Ather'; // Default tier
    }

    return normalizeTierName(result.rows[0].current_tier_name);
  } catch (error) {
    logError('Error getting user tier:', error);
    return 'Ather';
  }
}

/**
 * Validate that booking datetime is not in the past.
 * Call this for ALL bookings that have date+time (spa, wellness, massage, etc.)
 * — not just dining/events/shows.
 *
 * @param {String} booking_date - YYYY-MM-DD
 * @param {String} booking_time - HH:MM
 * @returns {Object} { allowed: boolean, reason?: string, message?: string }
 */
function validateBookingNotInPast(booking_date, booking_time, timezone = DEFAULT_DISPLAY_TZ) {
  if (!booking_date || !booking_time) {
    return { allowed: true };
  }
  const requestedDateTime = parseBookingDateTime(booking_date, booking_time, timezone);
  if (!requestedDateTime) {
    return {
      allowed: false,
      reason: 'INVALID_BOOKING_DATETIME',
      message: 'Please select a valid booking date and time.'
    };
  }
  const now = new Date();
  const graceMs = PAST_BOOKING_GRACE_MINUTES * 60 * 1000;
  const cutoff = now.getTime() - graceMs;
  if (requestedDateTime.getTime() < cutoff) {
    return {
      allowed: false,
      reason: 'BOOKING_TIME_IN_PAST',
      message: 'Selected booking time has already passed. Please choose a current or future time slot.'
    };
  }
  return { allowed: true };
}

/**
 * Date-only validation for non-time-based services (spa, wellness, travel, others, etc.).
 * User selects only date; time slot is confirmed by contacting partner.
 * Reject only if the selected date is in the past.
 *
 * @param {String} booking_date - YYYY-MM-DD
 * @param {String} timezone - Partner timezone
 * @returns {Object} { allowed: boolean, reason?: string, message?: string }
 */
function validateBookingDateNotInPast(booking_date, timezone = DEFAULT_DISPLAY_TZ) {
  if (!booking_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(booking_date).trim())) {
    return { allowed: true };
  }
  const { getNowInTZ } = require('../utils/timeService');
  const todayInPartnerTZ = getNowInTZ(timezone).date; // YYYY-MM-DD
  const selectedDateStr = String(booking_date).trim();
  if (selectedDateStr < todayInPartnerTZ) {
    return {
      allowed: false,
      reason: 'BOOKING_DATE_IN_PAST',
      message: 'Selected date has already passed. Please choose today or a future date.'
    };
  }
  return { allowed: true };
}

module.exports = {
  validateBookingRequest,
  validateBookingNotInPast,
  validateBookingDateNotInPast,
  checkEchelonOverride,
  getUserTier
};
