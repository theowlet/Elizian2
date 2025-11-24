/**
 * @module storage
 * @description Centralized local storage wrapper with error handling
 * @author Elizian Team
 * @version 1.0.0
 */

// ==========================================
// CONSTANTS
// ==========================================
const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'userInfo',
  USER_TYPE: 'userType',
  VERIFIED_OTP: 'verifiedOTP',
  CACHED_EVENTS: 'cachedEvents',
  CACHED_RESTAURANTS: 'cachedRestaurants',
  USER_PREFERENCES: 'userPreferences',
  BOOKING_HISTORY: 'bookingHistory'
};

const CACHE_DURATION = {
  EVENTS: 5 * 60 * 1000,      // 5 minutes
  RESTAURANTS: 10 * 60 * 1000, // 10 minutes
  USER_INFO: 24 * 60 * 60 * 1000 // 24 hours
};

// ==========================================
// PUBLIC FUNCTIONS
// ==========================================

/**
 * Set item in localStorage with error handling
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {boolean} Success status
 */
export function setItem(key, value) {
  try {
    // Store strings as-is, objects as JSON
    const toStore = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, toStore);
    return true;
  } catch (error) {
    console.error(`[storage] Failed to set ${key}:`, error);
    return false;
  }
}

/**
 * Get item from localStorage with error handling
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Stored value or default
 */
export function getItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    
    // Try to parse as JSON first
    try {
      return JSON.parse(item);
    } catch (parseError) {
      // If parsing fails, it might be a plain string (like a JWT token)
      // Check if it looks like a JWT token (starts with "eyJ")
      if (item.startsWith('eyJ')) {
        return item; // Return as-is for JWT tokens
      }
      // Otherwise, return the raw string
      return item;
    }
  } catch (error) {
    console.error(`[storage] Failed to get ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[storage] Failed to remove ${key}:`, error);
    return false;
  }
}

/**
 * Clear all localStorage
 * @returns {boolean} Success status
 */
export function clear() {
  try {
    localStorage.clear();
    return true;
  } catch (error) {
    console.error('[storage] Failed to clear storage:', error);
    return false;
  }
}

// ==========================================
// AUTHENTICATION HELPERS
// ==========================================

/**
 * Set authentication token
 * @param {string} token - JWT token
 * @param {string} userType - User type (user, admin, partner)
 * @returns {boolean} Success status
 */
export function setAuthToken(token, userType = 'user') {
  const success = setItem(STORAGE_KEYS.TOKEN, token);
  if (success) {
    setItem(STORAGE_KEYS.USER_TYPE, userType);
  }
  return success;
}

/**
 * Get authentication token
 * @returns {string|null} JWT token or null
 */
export function getAuthToken() {
  return getItem(STORAGE_KEYS.TOKEN);
}

/**
 * Set user information
 * @param {Object} userInfo - User data object
 * @returns {boolean} Success status
 */
export function setUserInfo(userInfo) {
  return setItem(STORAGE_KEYS.USER_INFO, userInfo);
}

/**
 * Get user information
 * @returns {Object|null} User data or null
 */
export function getUserInfo() {
  return getItem(STORAGE_KEYS.USER_INFO, {});
}

/**
 * Check if user is authenticated
 * @returns {boolean} Authentication status
 */
export function isAuthenticated() {
  return !!getAuthToken();
}

/**
 * Clear authentication data
 * @returns {boolean} Success status
 */
export function clearAuth() {
  removeItem(STORAGE_KEYS.TOKEN);
  removeItem(STORAGE_KEYS.USER_INFO);
  removeItem(STORAGE_KEYS.USER_TYPE);
  removeItem(STORAGE_KEYS.VERIFIED_OTP);
  return true;
}

// ==========================================
// CACHE HELPERS
// ==========================================

/**
 * Set cached data with timestamp
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @returns {boolean} Success status
 */
export function setCache(key, data) {
  const cacheData = {
    data,
    timestamp: Date.now()
  };
  return setItem(key, cacheData);
}

/**
 * Get cached data if not expired
 * @param {string} key - Cache key
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {any|null} Cached data or null if expired/missing
 */
export function getCache(key, maxAge) {
  const cacheData = getItem(key);
  
  if (!cacheData || !cacheData.timestamp) {
    return null;
  }
  
  const age = Date.now() - cacheData.timestamp;
  if (age > maxAge) {
    removeItem(key); // Clean up expired cache
    return null;
  }
  
  return cacheData.data;
}

/**
 * Set cached events
 * @param {Array} events - Events array
 * @returns {boolean} Success status
 */
export function setCachedEvents(events) {
  return setCache(STORAGE_KEYS.CACHED_EVENTS, events);
}

/**
 * Get cached events if not expired
 * @returns {Array|null} Events array or null if expired
 */
export function getCachedEvents() {
  return getCache(STORAGE_KEYS.CACHED_EVENTS, CACHE_DURATION.EVENTS);
}

/**
 * Set cached restaurants
 * @param {Array} restaurants - Restaurants array
 * @returns {boolean} Success status
 */
export function setCachedRestaurants(restaurants) {
  return setCache(STORAGE_KEYS.CACHED_RESTAURANTS, restaurants);
}

/**
 * Get cached restaurants if not expired
 * @returns {Array|null} Restaurants array or null if expired
 */
export function getCachedRestaurants() {
  return getCache(STORAGE_KEYS.CACHED_RESTAURANTS, CACHE_DURATION.RESTAURANTS);
}

// ==========================================
// USER PREFERENCES
// ==========================================

/**
 * Set user preferences
 * @param {Object} preferences - User preferences object
 * @returns {boolean} Success status
 */
export function setUserPreferences(preferences) {
  return setItem(STORAGE_KEYS.USER_PREFERENCES, preferences);
}

/**
 * Get user preferences
 * @returns {Object} User preferences object
 */
export function getUserPreferences() {
  return getItem(STORAGE_KEYS.USER_PREFERENCES, {
    theme: 'light',
    notifications: true,
    language: 'en',
    currency: 'INR'
  });
}

// ==========================================
// BOOKING HISTORY
// ==========================================

/**
 * Add booking to history
 * @param {Object} booking - Booking object
 * @returns {boolean} Success status
 */
export function addBookingToHistory(booking) {
  const history = getBookingHistory();
  history.unshift({
    ...booking,
    timestamp: Date.now()
  });
  
  // Keep only last 50 bookings
  if (history.length > 50) {
    history.splice(50);
  }
  
  return setItem(STORAGE_KEYS.BOOKING_HISTORY, history);
}

/**
 * Get booking history
 * @returns {Array} Array of booking objects
 */
export function getBookingHistory() {
  return getItem(STORAGE_KEYS.BOOKING_HISTORY, []);
}

// ==========================================
// EXPORTS
// ==========================================
export { STORAGE_KEYS, CACHE_DURATION };




