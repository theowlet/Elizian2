/**
 * Centralized TimeService for enterprise-grade timezone handling.
 * All datetime conversion and validation should use this module.
 *
 * RULES:
 * - All incoming API datetime must be ISO 8601.
 * - Convert to UTC before persistence.
 * - Always send ISO 8601 UTC in API responses.
 * - Convert only at presentation layer.
 *
 * @module timeService
 */

const DEFAULT_DISPLAY_TZ = 'Asia/Kolkata';

/**
 * Validate ISO 8601 datetime string.
 * @param {string} input - Datetime string
 * @returns {boolean} - True if valid ISO 8601
 */
function validateISO8601(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  const d = new Date(trimmed);
  return !Number.isNaN(d.getTime());
}

/**
 * Convert datetime to UTC ISO string.
 * @param {string|Date} datetime - Input (ISO string or Date)
 * @param {string} [inputTimezone] - IANA timezone if input is local (e.g. 'Asia/Kolkata')
 * @returns {string|null} - ISO 8601 UTC string (e.g. "2026-02-27T10:30:00.000Z") or null
 */
function convertToUTC(datetime, inputTimezone) {
  if (!datetime) return null;
  const d = datetime instanceof Date ? datetime : new Date(datetime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Convert UTC datetime to display string in target timezone.
 * @param {string|Date} datetimeUTC - UTC datetime (ISO string or Date)
 * @param {string} [timezone] - IANA timezone (default: Asia/Kolkata)
 * @param {Object} [options] - Intl.DateTimeFormatOptions
 * @returns {string|null} - Formatted string or null
 */
function convertFromUTC(datetimeUTC, timezone = DEFAULT_DISPLAY_TZ, options = {}) {
  if (!datetimeUTC) return null;
  const d = datetimeUTC instanceof Date ? datetimeUTC : new Date(datetimeUTC);
  if (Number.isNaN(d.getTime())) return null;
  const opts = {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  return new Intl.DateTimeFormat('en-IN', opts).format(d);
}

/**
 * Get user timezone from request (Accept-Language, header, or user preference).
 * @param {Object} request - Express req object
 * @returns {string} - IANA timezone string
 */
function getUserTimezone(request) {
  if (!request) return DEFAULT_DISPLAY_TZ;
  const header = request.headers?.['x-timezone'] || request.headers?.['x-user-timezone'];
  if (header && typeof header === 'string') return header.trim();
  if (request.user?.timezone) return request.user.timezone;
  return DEFAULT_DISPLAY_TZ;
}

/**
 * Format datetime for display in user's timezone.
 * @param {string|Date} datetimeUTC - UTC datetime
 * @param {Object} request - Express req (optional)
 * @returns {string|null}
 */
function formatForDisplay(datetimeUTC, request) {
  const tz = request ? getUserTimezone(request) : DEFAULT_DISPLAY_TZ;
  return convertFromUTC(datetimeUTC, tz);
}

/**
 * Get current UTC ISO string.
 * @returns {string}
 */
function nowUTC() {
  return new Date().toISOString();
}

/**
 * Convert an IANA timezone name to a UTC offset string for a given date.
 * Uses Intl.DateTimeFormat to resolve the actual offset (DST-safe).
 *
 * Examples:
 *   getUTCOffsetForTZ('Asia/Kolkata')       → '+05:30'
 *   getUTCOffsetForTZ('America/New_York')   → '-05:00' (EST) or '-04:00' (EDT)
 *   getUTCOffsetForTZ('Europe/London')      → '+00:00' (GMT) or '+01:00' (BST)
 *
 * @param {string} timezone - IANA timezone (e.g. 'Asia/Kolkata')
 * @param {Date}   [date]   - Reference date for DST resolution (default: now)
 * @returns {string} - UTC offset like '+05:30' or '-04:00'
 */
function getUTCOffsetForTZ(timezone, date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    // tzPart.value is like "GMT+5:30", "GMT-5", or "GMT"
    const match = (tzPart?.value || '').match(/GMT([+-]?\d{1,2}(?::\d{2})?)?/);
    if (!match || !match[1]) return '+00:00'; // Pure GMT/UTC
    const raw = match[1];
    const [h, m] = raw.includes(':') ? raw.split(':') : [raw, '0'];
    const sign = h.startsWith('-') ? '-' : '+';
    const absH = Math.abs(parseInt(h, 10));
    const absM = parseInt(m, 10) || 0;
    return `${sign}${String(absH).padStart(2, '0')}:${String(absM).padStart(2, '0')}`;
  } catch {
    // Invalid timezone name → fall back to UTC
    return '+00:00';
  }
}

/**
 * Parse booking date + time (YYYY-MM-DD, HH:MM) into a Date object,
 * interpreting the values in the specified IANA timezone.
 *
 * This is server-timezone-independent: a booking at 19:30 in Asia/Kolkata
 * will always parse to 14:00 UTC regardless of where the server runs.
 *
 * @param {string} dateStr  - YYYY-MM-DD
 * @param {string} timeStr  - HH:MM or HH:MM:SS
 * @param {string} [timezone] - IANA timezone (default: Asia/Kolkata)
 * @returns {Date|null}
 */
function parseBookingDateTime(dateStr, timeStr, timezone = DEFAULT_DISPLAY_TZ) {
  if (!dateStr || !timeStr) return null;
  const datePart = String(dateStr).trim();
  const timePart = String(timeStr).trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{2}:\d{2}$/.test(timePart)) return null;
  const offset = getUTCOffsetForTZ(timezone);
  const d = new Date(`${datePart}T${timePart}:00${offset}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Get current date and time in a specific timezone.
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM' }.
 *
 * Server-timezone-independent: always returns the wall-clock values
 * for the requested IANA timezone.
 *
 * @param {string} [timezone] - IANA timezone (default: Asia/Kolkata)
 * @returns {{ date: string, time: string }}
 */
function getNowInTZ(timezone = DEFAULT_DISPLAY_TZ) {
  const now = new Date();
  // en-CA locale gives YYYY-MM-DD format
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  // en-GB with hour12:false gives 24-hour HH:MM
  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return { date: dateStr, time: timeStr };
}

/**
 * Parse a date-only string (YYYY-MM-DD) in a given timezone at a specific hour.
 * Useful for voucher expiry calculations.
 *
 * Examples:
 *   parseDateInTZ('2026-03-01', 'Asia/Kolkata', 0)  → 2026-02-28T18:30:00.000Z (IST midnight)
 *   parseDateInTZ('2026-03-01', 'Asia/Kolkata', 12) → 2026-03-01T06:30:00.000Z (IST noon)
 *
 * @param {string} dateStr   - YYYY-MM-DD
 * @param {string} [timezone] - IANA timezone (default: Asia/Kolkata)
 * @param {number} [hour]    - Hour of day 0-23 (default: 0 = midnight)
 * @returns {Date|null}
 */
function parseDateInTZ(dateStr, timezone = DEFAULT_DISPLAY_TZ, hour = 0) {
  const d = String(dateStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const offset = getUTCOffsetForTZ(timezone);
  const hh = String(hour).padStart(2, '0');
  const result = new Date(`${d}T${hh}:00:00${offset}`);
  return Number.isNaN(result.getTime()) ? null : result;
}

module.exports = {
  validateISO8601,
  convertToUTC,
  convertFromUTC,
  getUserTimezone,
  formatForDisplay,
  nowUTC,
  parseBookingDateTime,
  getUTCOffsetForTZ,
  getNowInTZ,
  parseDateInTZ,
  DEFAULT_DISPLAY_TZ,
};
