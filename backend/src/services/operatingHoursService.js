const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * ===============================
 * OPERATING HOURS SERVICE
 * ===============================
 * 
 * Enterprise-grade booking validation for multi-industry platform.
 * Supports: restaurants, healthcare, travel, entertainment, professional services.
 * 
 * KEY FEATURES:
 * - ✅ Overnight service support (e.g., 22:00 → 04:00)
 * - ✅ Previous-day spillover handling (Friday 01:00 = Thursday night)
 * - ✅ Minute-based comparison (no string comparison bugs)
 * - ✅ Duration-safe validation
 * - ✅ MULTIPLE breaks per day (unlimited, customizable)
 * - ✅ UTC-safe date handling
 * - ✅ Special closure support
 * - ✅ Premium hospitality-grade validation
 * - ✅ Input validation & error handling
 * 
 * MANDATORY: All bookings MUST pass validateBookingTime() check
 */

/**
 * ===============================
 * ENTERPRISE TIME UTILITIES
 * ===============================
 */

/**
 * Normalize time to HH:MM (no seconds). Use for all API/response output.
 * @param {String} timeStr - Time as HH:MM or HH:MM:SS
 * @returns {String|null} - "HH:MM" or null
 */
function toHHMM(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Convert time string to minutes since midnight. Accepts HH:MM or HH:MM:SS (seconds ignored).
 * @param {String} timeStr - Time in HH:MM or HH:MM:SS (24-hour)
 * @returns {Number|null} - Minutes since midnight (0-1439) or null
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Normalize minutes to 24-hour range (handles overflow/underflow)
 * @param {Number} mins - Minutes (can be negative or > 1440)
 * @returns {Number} - Normalized minutes (0-1439)
 * @example normalizeMinutes(1500) => 60 (25:00 = 01:00 next day)
 */
function normalizeMinutes(mins) {
  return ((mins % 1440) + 1440) % 1440;
}

/**
 * Normalize breaks from DB: may be JSONB array, stringified JSON, or null.
 * Use before .map() to avoid runtime errors.
 * @param {*} raw - Value from dayHours.breaks or hours.breaks
 * @returns {Array<{ start: string, end: string }>}
 */
function normalizeBreaks(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Check if operating hours span midnight (overnight service)
 * @param {Number} openMin - Opening time in minutes
 * @param {Number} closeMin - Closing time in minutes
 * @returns {Boolean} - True if overnight (e.g., 22:00 → 04:00)
 * @example isOvernight(1320, 240) => true (22:00 → 04:00)
 */
function isOvernight(openMin, closeMin) {
  return closeMin < openMin;
}

/**
 * Check if booking window fits within operating hours
 * Handles both normal and overnight services
 * 
 * @param {Number} startMin - Booking start time in minutes
 * @param {Number} endMin - Booking end time in minutes
 * @param {Number} openMin - Opening time in minutes
 * @param {Number} closeMin - Closing time in minutes
 * @returns {Boolean} - True if booking fits within hours
 */
function isWithinWindow(startMin, endMin, openMin, closeMin) {
  if (!isOvernight(openMin, closeMin)) {
    // Normal day: 10:00 → 22:00
    return startMin >= openMin && endMin <= closeMin;
  }

  // Overnight case: 18:00 → 02:00
  return (
    (startMin >= openMin || startMin < closeMin) &&
    (endMin > openMin || endMin <= closeMin)
  );
}

/**
 * Check if booking overlaps with ANY break period
 * Supports multiple breaks per day
 * 
 * @param {Number} startMin - Booking start time in minutes
 * @param {Number} endMin - Booking end time in minutes
 * @param {Array} breaks - Array of break objects [{start: "14:00", end: "15:00"}, ...]
 * @returns {Object} - {overlaps: boolean, breakPeriod?: Object} - Returns which break if overlap found
 */
function overlapsAnyBreak(startMin, endMin, breaks) {
  if (!breaks || !Array.isArray(breaks) || breaks.length === 0) {
    return { overlaps: false };
  }

  for (const breakPeriod of breaks) {
    if (!breakPeriod.start || !breakPeriod.end) continue;

    const breakStartMin = timeToMinutes(breakPeriod.start);
    const breakEndMin = timeToMinutes(breakPeriod.end);
    
    if (breakStartMin === null || breakEndMin === null) continue;

    // Interval overlap: booking overlaps break if start < break_end AND end > break_start
    if (startMin < breakEndMin && endMin > breakStartMin) {
      return {
        overlaps: true,
        breakPeriod: {
          start: toHHMM(breakPeriod.start),
          end: toHHMM(breakPeriod.end)
        }
      };
    }
  }

  return { overlaps: false };
}

/**
 * Convert minutes back to HH:MM format
 * @param {Number} minutes - Minutes since midnight
 * @returns {String} - Time in HH:MM format
 */
function minutesToTime(minutes) {
  const normalized = normalizeMinutes(minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * ===============================
 * CORE VALIDATION LOGIC
 * ===============================
 */

/**
 * Validate booking time against operating hours
 * 
 * CRITICAL: This is the gatekeeper - all bookings MUST pass this check
 * 
 * SUPPORTS:
 * - Normal operating hours (10:00 → 22:00)
 * - Overnight services (22:00 → 04:00)
 * - Previous-day spillover (Friday 01:00 covered by Thursday's overnight hours)
 * - MULTIPLE break periods per day
 * - Special closures/custom hours
 * - Booking duration validation
 * 
 * @param {UUID} partnerId - Partner/venue ID
 * @param {String} bookingDate - Date in YYYY-MM-DD format
 * @param {String} bookingTime - Time in HH:MM format (24-hour)
 * @param {Number} durationMinutes - Booking duration in minutes (default: 0)
 * @returns {Object} { valid: boolean, reason?: string, source?: string, message?: string, hours?: Object }
 * 
 * @example
 * // Restaurant booking
 * validateBookingTime(partnerId, '2026-02-15', '19:30', 120)
 * 
 * @example
 * // Nightclub overnight booking
 * validateBookingTime(partnerId, '2026-02-15', '23:00', 180) // 23:00-02:00
 * 
 * @example
 * // Doctor appointment with multiple breaks
 * validateBookingTime(partnerId, '2026-02-15', '14:30', 30) // Checks all break periods
 */
async function validateBookingTime(partnerId, bookingDate, bookingTime, durationMinutes = 0) {
  try {
    // Validate bookingDate format (YYYY-MM-DD) and valid date
    if (!bookingDate || typeof bookingDate !== 'string') {
      return { valid: false, reason: 'INVALID_DATE', message: 'Booking date is required' };
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(bookingDate.trim())) {
      return { valid: false, reason: 'INVALID_DATE', message: 'Date must be YYYY-MM-DD' };
    }
    const [year, month, day] = bookingDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dateObj.getTime()) || dateObj.getUTCFullYear() !== year || dateObj.getUTCMonth() !== month - 1 || dateObj.getUTCDate() !== day) {
      return { valid: false, reason: 'INVALID_DATE', message: 'Invalid date' };
    }

    // Ensure tables exist (defensive programming)
    await ensurePartnerHoursTable();
    await ensurePartnerSpecialClosuresTable();

    // Validate duration
    if (durationMinutes < 0) {
      return { valid: false, reason: 'INVALID_DURATION' };
    }

    // ========================================
    // 1. PARTNER STATUS VALIDATION
    // ========================================
    const partnerCheck = await pool.query(
      `SELECT accepting_bookings, is_active, status
       FROM partners
       WHERE id = $1`,
      [partnerId]
    );

    if (partnerCheck.rows.length === 0) {
      return { valid: false, reason: 'PARTNER_NOT_FOUND' };
    }

    const partner = partnerCheck.rows[0];

    if (!partner.is_active || (partner.status !== 'active' && partner.status !== 'approved')) {
      return { valid: false, reason: 'PARTNER_INACTIVE' };
    }

    if (!partner.accepting_bookings) {
      return { valid: false, reason: 'PARTNER_NOT_ACCEPTING_BOOKINGS' };
    }

    // ========================================
    // 2. CONVERT TO MINUTES FOR ROBUST COMPARISON
    // ========================================
    const startMin = timeToMinutes(bookingTime);
    const endMin = normalizeMinutes(startMin + durationMinutes);

    // ========================================
    // 3. UTC-SAFE DATE (already parsed and validated above)
    // ========================================
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const previousDay = (dayOfWeek + 6) % 7;

    // ========================================
    // 4. CHECK SPECIAL CLOSURES (HIGHEST PRIORITY)
    // ========================================
    const closureCheck = await pool.query(
      `SELECT is_full_day, custom_opens_at, custom_closes_at, closure_reason
       FROM partner_special_closures
       WHERE partner_id = $1 AND closure_date = $2`,
      [partnerId, bookingDate]
    );

    if (closureCheck.rows.length > 0) {
      const closure = closureCheck.rows[0];

      if (closure.is_full_day) {
        return {
          valid: false,
          reason: 'VENUE_CLOSED_ON_DATE',
          message: closure.closure_reason || 'Venue closed on this date'
        };
      }

      if (closure.custom_opens_at && closure.custom_closes_at) {
        const openMin = timeToMinutes(closure.custom_opens_at);
        const closeMin = timeToMinutes(closure.custom_closes_at);

        if (!isWithinWindow(startMin, endMin, openMin, closeMin)) {
          return {
            valid: false,
            reason: 'OUTSIDE_SPECIAL_HOURS',
            message: `Modified hours on this date: ${toHHMM(closure.custom_opens_at)} - ${toHHMM(closure.custom_closes_at)}`
          };
        }

        return { 
          valid: true, 
          source: 'SPECIAL_DAY',
          hours: {
            opens_at: toHHMM(closure.custom_opens_at),
            closes_at: toHHMM(closure.custom_closes_at),
            is_special: true
          }
        };
      }
    }

    // ========================================
    // 5. FETCH TODAY'S OPERATING HOURS
    // ========================================
    const { rows: todayRows } = await pool.query(
      `SELECT opens_at, closes_at, is_closed, breaks
       FROM partner_hours
       WHERE partner_id = $1 AND day_of_week = $2`,
      [partnerId, dayOfWeek]
    );

    // ========================================
    // 6. FETCH PREVIOUS DAY'S HOURS (FOR OVERNIGHT SPILLOVER)
    // ========================================
    const { rows: prevRows } = await pool.query(
      `SELECT opens_at, closes_at, is_closed, breaks
       FROM partner_hours
       WHERE partner_id = $1 AND day_of_week = $2`,
      [partnerId, previousDay]
    );

    // ========================================
    // 7. CHECK TODAY'S HOURS
    // ========================================
    if (todayRows.length > 0) {
      const hours = todayRows[0];

      if (!hours.is_closed && hours.opens_at && hours.closes_at) {
        const openMin = timeToMinutes(hours.opens_at);
        const closeMin = timeToMinutes(hours.closes_at);

        // Parse breaks (JSONB array or string from DB)
        const breaks = normalizeBreaks(hours.breaks);

        // Check if booking fits within hours and doesn't overlap any break
        const breakCheck = overlapsAnyBreak(startMin, endMin, breaks);
        
        if (isWithinWindow(startMin, endMin, openMin, closeMin) && !breakCheck.overlaps) {
          return {
            valid: true,
            source: 'TODAY',
            hours: {
              opens_at: toHHMM(hours.opens_at),
              closes_at: toHHMM(hours.closes_at),
              breaks: breaks.map(b => ({ start: toHHMM(b.start), end: toHHMM(b.end) }))
            }
          };
        }

        // If overlap detected, provide specific message
        if (breakCheck.overlaps) {
          return {
            valid: false,
            reason: 'OVERLAPS_BREAK_PERIOD',
            message: `Booking conflicts with break time: ${breakCheck.breakPeriod.start} - ${breakCheck.breakPeriod.end}`,
            hours
          };
        }
      }
    }

    // ========================================
    // 8. CHECK PREVIOUS DAY'S OVERNIGHT HOURS
    // ========================================
    if (prevRows.length > 0) {
      const hours = prevRows[0];

      if (!hours.is_closed && hours.opens_at && hours.closes_at) {
        const openMin = timeToMinutes(hours.opens_at);
        const closeMin = timeToMinutes(hours.closes_at);

        // Only check if previous day has overnight hours
        if (isOvernight(openMin, closeMin)) {
          const breaks = normalizeBreaks(hours.breaks);
          const breakCheck = overlapsAnyBreak(startMin, endMin, breaks);

          if (isWithinWindow(startMin, endMin, openMin, closeMin) && !breakCheck.overlaps) {
            return { 
              valid: true, 
              source: 'PREVIOUS_DAY_OVERNIGHT',
              hours: {
                opens_at: toHHMM(hours.opens_at),
                closes_at: toHHMM(hours.closes_at),
                breaks: breaks.map(b => ({ start: toHHMM(b.start), end: toHHMM(b.end) })),
                note: `Covered by ${getDayName(previousDay)}'s overnight hours`
              }
            };
          }

          if (breakCheck.overlaps) {
            return {
              valid: false,
              reason: 'OVERLAPS_BREAK_PERIOD',
              message: `Booking conflicts with ${getDayName(previousDay)}'s break time: ${breakCheck.breakPeriod.start} - ${breakCheck.breakPeriod.end}`,
              hours
            };
          }
        }
      }
    }

    // ========================================
    // 9. NO HOURS CONFIGURED (BACKWARD COMPATIBILITY)
    // ========================================
    if (todayRows.length === 0 && prevRows.length === 0) {
      log(`⚠️ No operating hours configured for partner ${partnerId}, day ${dayOfWeek} - allowing booking`);
      return { valid: true, source: 'NO_HOURS_CONFIGURED', hours: null };
    }

    // ========================================
    // 10. REJECTION WITH CONTEXT
    // ========================================
    const rejectionReason = todayRows.length > 0 && todayRows[0].is_closed
      ? 'VENUE_CLOSED_ON_DAY'
      : 'OUTSIDE_OPERATING_HOURS';

    const rejectionMessage = todayRows.length > 0 && todayRows[0].is_closed
      ? `Venue closed on ${getDayName(dayOfWeek)}s`
      : `Booking time ${bookingTime} is outside operating hours`;

    return { 
      valid: false, 
      reason: rejectionReason,
      message: rejectionMessage,
      hours: todayRows.length > 0 ? todayRows[0] : null
    };

  } catch (error) {
    logError('Error validating booking time:', error);
    throw error;
  }
}

/**
 * ===============================
 * TIME RANGE VALIDATION
 * ===============================
 */

/**
 * Validate time range for operating hours or breaks
 * Ensures logical consistency before saving to database
 * 
 * @param {String} opensAt - Opening time HH:MM
 * @param {String} closesAt - Closing time HH:MM
 * @param {Array} breaks - Array of break objects [{start: "14:00", end: "15:00"}, ...]
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateTimeRange(opensAt, closesAt, breaks = null) {
  // If closed or no hours set, skip validation
  if (!opensAt || !closesAt) {
    return { valid: true };
  }

  const openMin = timeToMinutes(opensAt);
  const closeMin = timeToMinutes(closesAt);

  // Opening and closing times cannot be the same
  if (opensAt === closesAt) {
    return { 
      valid: false, 
      error: 'Opening and closing times cannot be the same' 
    };
  }

  // Validate breaks if provided
  if (breaks && Array.isArray(breaks) && breaks.length > 0) {
    // Sort breaks by start time for overlap checking
    const sortedBreaks = [...breaks].sort((a, b) => {
      const aMin = timeToMinutes(a.start);
      const bMin = timeToMinutes(b.start);
      return aMin - bMin;
    });

    for (let i = 0; i < sortedBreaks.length; i++) {
      const breakPeriod = sortedBreaks[i];

      if (!breakPeriod.start || !breakPeriod.end) {
        return {
          valid: false,
          error: 'Each break must have both start and end times'
        };
      }

      const breakStartMin = timeToMinutes(breakPeriod.start);
      const breakEndMin = timeToMinutes(breakPeriod.end);

      // Break start must be before break end
      if (breakStartMin >= breakEndMin) {
        return { 
          valid: false, 
          error: `Break ${i + 1}: start time must be before end time` 
        };
      }

      // For normal hours, breaks must be within operating hours
      if (!isOvernight(openMin, closeMin)) {
        if (breakStartMin < openMin || breakEndMin > closeMin) {
          return { 
            valid: false, 
            error: `Break ${i + 1} (${breakPeriod.start}-${breakPeriod.end}) must be within operating hours` 
          };
        }
      } else {
        // For overnight hours, break cannot span midnight
        const breakFullyInEvening = breakStartMin >= openMin && breakEndMin >= openMin;
        const breakFullyInMorning = breakStartMin < closeMin && breakEndMin <= closeMin;
        
        if (!breakFullyInEvening && !breakFullyInMorning) {
          return {
            valid: false,
            error: `Break ${i + 1}: For overnight services, breaks cannot span midnight`
          };
        }
      }

      // Check for overlapping breaks
      if (i > 0) {
        const prevBreak = sortedBreaks[i - 1];
        const prevBreakEndMin = timeToMinutes(prevBreak.end);

        if (breakStartMin < prevBreakEndMin) {
          return {
            valid: false,
            error: `Break ${i + 1} overlaps with break ${i}`
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * ===============================
 * OPERATING HOURS MANAGEMENT
 * ===============================
 */

/**
 * Get partner's operating hours for a full week
 * Returns structured schedule with all break times
 * 
 * @param {UUID} partnerId - Partner ID
 * @returns {Object} Weekly schedule keyed by day name
 */
async function getPartnerOperatingHours(partnerId) {
  try {
    await ensurePartnerHoursTable();
    const result = await pool.query(
      `SELECT day_of_week, opens_at, closes_at, is_closed, breaks
       FROM partner_hours
       WHERE partner_id = $1
       ORDER BY day_of_week`,
      [partnerId]
    );

    const schedule = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    days.forEach((day, index) => {
      const dayHours = result.rows.find(r => r.day_of_week === index);
      
      schedule[day] = dayHours
        ? {
            day_of_week: index,
            opens_at: toHHMM(dayHours.opens_at),
            closes_at: toHHMM(dayHours.closes_at),
            is_closed: dayHours.is_closed,
            breaks: normalizeBreaks(dayHours.breaks).map(b => ({ 
              start: toHHMM(b.start), 
              end: toHHMM(b.end) 
            })),
            is_overnight: dayHours.opens_at && dayHours.closes_at 
              ? isOvernight(timeToMinutes(dayHours.opens_at), timeToMinutes(dayHours.closes_at))
              : false
          }
        : {
            day_of_week: index,
            is_closed: false,
            opens_at: null,
            closes_at: null,
            breaks: [],
            is_overnight: false
          };
    });

    return schedule;
  } catch (error) {
    logError('Error getting operating hours:', error);
    throw error;
  }
}

/**
 * Get opening hours for a specific date (considering special closures)
 * 
 * @param {UUID} partnerId - Partner ID
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Object} Hours for that specific date
 */
async function getOpeningHoursForDate(partnerId, date) {
  try {
    // Check special closure first (highest priority)
    const closureResult = await pool.query(
      `SELECT is_full_day, custom_opens_at, custom_closes_at, closure_reason
       FROM partner_special_closures
       WHERE partner_id = $1 AND closure_date = $2`,
      [partnerId, date]
    );

    if (closureResult.rows.length > 0) {
      const closure = closureResult.rows[0];
      if (closure.is_full_day) {
        return {
          is_closed: true,
          reason: closure.closure_reason
        };
      }
      return {
        is_closed: false,
        opens_at: toHHMM(closure.custom_opens_at),
        closes_at: toHHMM(closure.custom_closes_at),
        is_special: true,
        reason: closure.closure_reason
      };
    }

    // Get regular hours for this day of week
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = dateObj.getUTCDay();

    await ensurePartnerHoursTable();
    const hoursResult = await pool.query(
      `SELECT opens_at, closes_at, is_closed, breaks
       FROM partner_hours
       WHERE partner_id = $1 AND day_of_week = $2`,
      [partnerId, dayOfWeek]
    );

    if (hoursResult.rows.length === 0) {
      return {
        is_closed: false,
        opens_at: null,
        closes_at: null,
        breaks: [],
        note: 'No hours configured'
      };
    }

    const hours = hoursResult.rows[0];
    return {
      is_closed: hours.is_closed,
      opens_at: toHHMM(hours.opens_at),
      closes_at: toHHMM(hours.closes_at),
      breaks: normalizeBreaks(hours.breaks).map(b => ({ 
        start: toHHMM(b.start), 
        end: toHHMM(b.end) 
      })),
      is_overnight: hours.opens_at && hours.closes_at
        ? isOvernight(timeToMinutes(hours.opens_at), timeToMinutes(hours.closes_at))
        : false
    };
  } catch (error) {
    logError('Error getting hours for date:', error);
    throw error;
  }
}

/**
 * Ensure partner_hours table exists (create if missing)
 * 
 * SCHEMA:
 * - breaks: JSONB array of {start: "HH:MM", end: "HH:MM"} objects
 * - Supports unlimited breaks per day
 * 
 * RECOMMENDED INDEXES for production:
 * CREATE INDEX IF NOT EXISTS idx_partner_hours_lookup 
 *   ON partner_hours(partner_id, day_of_week);
 * CREATE INDEX IF NOT EXISTS idx_partner_hours_breaks 
 *   ON partner_hours USING GIN (breaks);
 */
async function ensurePartnerHoursTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_hours (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL,
      opens_at TIME,
      closes_at TIME,
      is_closed BOOLEAN DEFAULT false,
      breaks JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add breaks column if it doesn't exist (migration support)
  await pool.query(`
    ALTER TABLE partner_hours 
    ADD COLUMN IF NOT EXISTS breaks JSONB DEFAULT '[]'::jsonb
  `).catch(() => { /* column may already exist */ });

  await pool.query(`
    ALTER TABLE partners 
    ADD COLUMN IF NOT EXISTS accepting_bookings BOOLEAN DEFAULT TRUE
  `).catch(() => { /* column may already exist */ });
}

/**
 * Ensure partner_special_closures table exists (create if missing)
 */
async function ensurePartnerSpecialClosuresTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_special_closures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      closure_date DATE NOT NULL,
      closure_reason TEXT,
      is_full_day BOOLEAN DEFAULT TRUE,
      custom_opens_at TIME,
      custom_closes_at TIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by UUID REFERENCES users(id),
      UNIQUE(partner_id, closure_date)
    )
  `).catch(() => { /* table may exist */ });
}

/**
 * Set/update partner's operating hours
 * Called from Partner Console
 * 
 * SUPPORTS MULTIPLE BREAKS PER DAY
 * 
 * @param {UUID} partnerId - Partner ID
 * @param {Array} hoursData - Array of 7 day objects:
 * [
 *   {
 *     day_of_week: 0,
 *     opens_at: "10:00",
 *     closes_at: "22:00",
 *     is_closed: false,
 *     breaks: [
 *       { start: "14:00", end: "15:00" },
 *       { start: "17:30", end: "18:00" }
 *     ]
 *   },
 *   ...
 * ]
 * @returns {Object} { success: boolean }
 */
async function setPartnerHours(partnerId, hoursData) {
  if (!hoursData || !Array.isArray(hoursData) || hoursData.length === 0) {
    throw new Error('Hours data is required (array of 7 days)');
  }

  if (hoursData.length !== 7) {
    throw new Error('Hours data must contain exactly 7 days (0-6)');
  }

  // Validate all time ranges before saving
  for (const dayData of hoursData) {
    if (!dayData.is_closed) {
      const validation = validateTimeRange(
        dayData.opens_at,
        dayData.closes_at,
        normalizeBreaks(dayData.breaks)
      );

      if (!validation.valid) {
        const dayName = getDayName(dayData.day_of_week);
        throw new Error(`Invalid hours for ${dayName}: ${validation.error}`);
      }
    }
  }

  await ensurePartnerHoursTable();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing hours
    await client.query('DELETE FROM partner_hours WHERE partner_id = $1', [partnerId]);

    // Insert new hours with breaks as JSONB
    const insertQuery = `
      INSERT INTO partner_hours 
      (partner_id, day_of_week, opens_at, closes_at, is_closed, breaks) 
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    for (const dayData of hoursData) {
      const day = Number(dayData.day_of_week);
      const opens = dayData.is_closed ? null : (dayData.opens_at || null);
      const closes = dayData.is_closed ? null : (dayData.closes_at || null);
      const isClosed = Boolean(dayData.is_closed);
      
      // Normalize breaks to always be an array (handles array or string from client)
      const breaks = dayData.is_closed ? [] : normalizeBreaks(dayData.breaks);

      await client.query(insertQuery, [
        partnerId,
        day,
        opens,
        closes,
        isClosed,
        JSON.stringify(breaks) // Store as JSONB
      ]);
    }

    await client.query('COMMIT');
    log(`✅ Operating hours updated for partner ${partnerId}`);

    return { success: true };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    logError('Error setting partner hours:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * ===============================
 * SPECIAL CLOSURES MANAGEMENT
 * ===============================
 */

/**
 * Add or update special closure (holiday, temporary closure, custom hours)
 * 
 * @param {UUID} partnerId - Partner ID
 * @param {Object} closureData - Closure details
 * @returns {Object} Created/updated closure record
 */
async function addSpecialClosure(partnerId, closureData) {
  try {
    await ensurePartnerSpecialClosuresTable();
    
    // Validate custom hours if provided
    if (!closureData.is_full_day && closureData.custom_opens_at && closureData.custom_closes_at) {
      const validation = validateTimeRange(
        closureData.custom_opens_at,
        closureData.custom_closes_at,
        []
      );

      if (!validation.valid) {
        throw new Error(`Invalid custom hours: ${validation.error}`);
      }
    }

    const result = await pool.query(
      `INSERT INTO partner_special_closures
       (partner_id, closure_date, closure_reason, is_full_day, custom_opens_at, custom_closes_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (partner_id, closure_date)
       DO UPDATE SET
         closure_reason = EXCLUDED.closure_reason,
         is_full_day = EXCLUDED.is_full_day,
         custom_opens_at = EXCLUDED.custom_opens_at,
         custom_closes_at = EXCLUDED.custom_closes_at
       RETURNING *`,
      [
        partnerId,
        closureData.closure_date,
        closureData.closure_reason || null,
        closureData.is_full_day !== false,
        closureData.custom_opens_at || null,
        closureData.custom_closes_at || null,
        closureData.created_by || null
      ]
    );

    log(`📅 Special closure added for partner ${partnerId} on ${closureData.closure_date}`);
    return result.rows[0];
  } catch (error) {
    logError('Error adding special closure:', error);
    throw error;
  }
}

/**
 * Get special closures for a partner
 * 
 * @param {UUID} partnerId - Partner ID
 * @param {Boolean} futureOnly - Only return future closures (default: true)
 * @returns {Array} List of closures
 */
async function getSpecialClosures(partnerId, futureOnly = true) {
  try {
    await ensurePartnerSpecialClosuresTable();
    
    let query = `
      SELECT *
      FROM partner_special_closures
      WHERE partner_id = $1
    `;

    if (futureOnly) {
      query += ` AND closure_date >= CURRENT_DATE`;
    }

    query += ` ORDER BY closure_date ASC`;

    const result = await pool.query(query, [partnerId]);
    return result.rows;
  } catch (error) {
    logError('Error getting special closures:', error);
    throw error;
  }
}

/**
 * Delete special closure
 * 
 * @param {UUID} closureId - Closure ID
 * @param {UUID} partnerId - Partner ID (for authorization)
 * @returns {Object} Deleted closure record
 */
async function deleteSpecialClosure(closureId, partnerId) {
  try {
    const result = await pool.query(
      `DELETE FROM partner_special_closures
       WHERE id = $1 AND partner_id = $2
       RETURNING *`,
      [closureId, partnerId]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Closure not found');
    }

    log(`🗑️ Special closure ${closureId} deleted for partner ${partnerId}`);
    return result.rows[0];
  } catch (error) {
    logError('Error deleting special closure:', error);
    throw error;
  }
}

/**
 * ===============================
 * BOOKING ACCEPTANCE TOGGLE
 * ===============================
 */

/**
 * Toggle accepting bookings flag
 * 
 * @param {UUID} partnerId - Partner ID
 * @param {Boolean} accepting - True to accept bookings, false to pause
 * @returns {Object} Updated partner record
 */
async function toggleAcceptingBookings(partnerId, accepting) {
  try {
    const result = await pool.query(
      `UPDATE partners
       SET accepting_bookings = $2
       WHERE id = $1
       RETURNING accepting_bookings`,
      [partnerId, accepting]
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Partner not found');
    }

    log(`${accepting ? '✅' : '🚫'} Partner ${partnerId} ${accepting ? 'accepting' : 'paused'} bookings`);
    return result.rows[0];
  } catch (error) {
    logError('Error toggling accepting bookings:', error);
    throw error;
  }
}

/**
 * ===============================
 * HELPER FUNCTIONS
 * ===============================
 */

/**
 * Get day name from day of week number
 * @param {Number} dayOfWeek - 0-6 (0 = Sunday)
 * @returns {String} Day name
 */
function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

/**
 * ===============================
 * MODULE EXPORTS
 * ===============================
 */

module.exports = {
  // Core validation
  validateBookingTime,
  
  // Hours management
  getPartnerOperatingHours,
  getOpeningHoursForDate,
  setPartnerHours,
  
  // Special closures
  addSpecialClosure,
  getSpecialClosures,
  deleteSpecialClosure,
  
  // Booking control
  toggleAcceptingBookings,
  
  // Utility functions (exported for testing)
  timeToMinutes,
  minutesToTime,
  normalizeMinutes,
  isOvernight,
  isWithinWindow,
  overlapsAnyBreak,
  validateTimeRange,
  toHHMM
};
