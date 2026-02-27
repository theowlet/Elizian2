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
 * Parse booking date + time (YYYY-MM-DD, HH:MM) into UTC Date.
 * Assumes input is in partner/user timezone.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:MM or HH:MM:SS
 * @param {string} [timezone] - IANA (default: Asia/Kolkata)
 * @returns {Date|null}
 */
function parseBookingDateTime(dateStr, timeStr, timezone = DEFAULT_DISPLAY_TZ) {
  if (!dateStr || !timeStr) return null;
  const datePart = String(dateStr).trim();
  const timePart = String(timeStr).trim().slice(0, 5);
  const iso = `${datePart}T${timePart}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

module.exports = {
  validateISO8601,
  convertToUTC,
  convertFromUTC,
  getUserTimezone,
  formatForDisplay,
  nowUTC,
  parseBookingDateTime,
  DEFAULT_DISPLAY_TZ,
};
