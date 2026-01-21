/**
 * Date and Timestamp Normalization Utilities
 * 
 * Handles conversion of various timestamp formats (epoch ms, ISO strings, Date objects)
 * to consistent ISO strings for database storage and API responses.
 */

/**
 * Normalize timestamp to ISO string
 * 
 * Accepts:
 * - Unix epoch milliseconds (number)
 * - ISO string
 * - Date object
 * - null/undefined
 * 
 * Returns:
 * - ISO string (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - null if invalid
 * 
 * @param {number|string|Date|null|undefined} value - Timestamp to normalize
 * @returns {string|null} ISO string or null
 */
function normalizeTimestamp(value) {
  if (!value) return null;
  
  try {
    // Handle epoch milliseconds (number)
    if (typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    
    // Handle Date object
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return value.toISOString();
    }
    
    // Handle string (ISO or other parseable format)
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    
    // Unknown type
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Normalize timestamp for PostgreSQL
 * 
 * Converts epoch milliseconds to ISO string for use in SQL queries
 * 
 * @param {number|string|Date|null|undefined} value - Timestamp to normalize
 * @returns {string|null} ISO string or null
 */
function normalizeTimestampForDB(value) {
  return normalizeTimestamp(value);
}

/**
 * Convert epoch milliseconds to ISO string
 * 
 * @param {number} epochMs - Unix timestamp in milliseconds
 * @returns {string|null} ISO string or null
 */
function epochMsToISO(epochMs) {
  if (typeof epochMs !== 'number') return null;
  return normalizeTimestamp(epochMs);
}

/**
 * Convert ISO string to epoch milliseconds
 * 
 * @param {string} isoString - ISO 8601 date string
 * @returns {number|null} Unix timestamp in milliseconds or null
 */
function isoToEpochMs(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  } catch {
    return null;
  }
}

/**
 * Check if a date is in the past
 * 
 * @param {number|string|Date} value - Date to check
 * @returns {boolean} True if date is in the past
 */
function isPast(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return false;
  return new Date(normalized) < new Date();
}

/**
 * Check if a date is in the future
 * 
 * @param {number|string|Date} value - Date to check
 * @returns {boolean} True if date is in the future
 */
function isFuture(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return false;
  return new Date(normalized) > new Date();
}

/**
 * Format date for display
 * 
 * @param {number|string|Date} value - Date to format
 * @param {string} format - Format string (default: 'YYYY-MM-DD')
 * @returns {string|null} Formatted date or null
 */
function formatDate(value, format = 'YYYY-MM-DD') {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return null;
  
  const date = new Date(normalized);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

module.exports = {
  normalizeTimestamp,
  normalizeTimestampForDB,
  epochMsToISO,
  isoToEpochMs,
  isPast,
  isFuture,
  formatDate,
  // Alias for backward compatibility
  normalizeTs: normalizeTimestamp
};

