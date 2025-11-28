/**
 * @module config
 * @description Central configuration for Elizian app
 * @author Elizian Team
 * @version 1.0.0
 */

// ==========================================
// API CONFIGURATION
// ==========================================
export const CONFIG = {
  // API Configuration
  API_BASE_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api/v1' 
    : 'https://api.yourdomain.com/api/v1',
  // Backward compatibility alias
  get apiUrl() {
    return this.API_BASE_URL;
  },
  
  // Token Economics
  TOKEN_VALUE: 100, // ₹100 per $EZT
  
  // Tier Reward Percentages
  TIER_PERCENTAGES: {
    'Ather': 1,
    'Nova': 2,
    'Luminar': 3,
    'Valiant': 4,
    'Echelon': 5
  },
  
  // Map Configuration
  MAP_CENTER: [28.6139, 77.2090], // Delhi coordinates
  MAP_ZOOM: 13,
  
  // Feature Flags
  FEATURES: {
    offlineMode: true,
    pushNotifications: true,
    socialFeatures: true,
    proximityDetection: true,
    caching: true,
    analytics: true,
    // Real-time WebSocket feature (ENABLED)
    ENABLE_REALTIME: true,
    REALTIME_FALLBACK: true,
    REALTIME_POLLING_INTERVAL: 30000
  },
  
  // UI Configuration
  UI: {
    animationDuration: 300,
    debounceDelay: 500,
    maxRetries: 3,
    loadingTimeout: 10000,
    notificationDuration: 3000
  },
  
  // Validation Rules
  VALIDATION: {
    phoneLength: 10,
    passwordMinLength: 6,
    otpLength: 6,
    maxBookingGuests: 8,
    maxBookingTickets: 8,
    maxBillAmount: 100000,
    minBillAmount: 1
  },
  
  // Cache Configuration
  CACHE: {
    events: 5 * 60 * 1000,      // 5 minutes
    restaurants: 10 * 60 * 1000, // 10 minutes
    userInfo: 24 * 60 * 60 * 1000 // 24 hours
  },
  
  // Error Messages
  ERRORS: {
    NETWORK: 'Network error. Please check your connection.',
    UNAUTHORIZED: 'Session expired. Please login again.',
    VALIDATION: 'Please check your input and try again.',
    SERVER: 'Server error. Please try again later.',
    TIMEOUT: 'Request timed out. Please try again.'
  }
};

// Version Information
export const VERSION = {
  app: '1.0.0',
  api: 'v1',
  modules: {
    auth: '1.2.0',
    events: '1.0.1',
    payments: '1.1.0',
    navigation: '1.0.0',
    map: '1.0.0'
  }
};

// Environment Detection
export const ENV = {
  isDevelopment: window.location.hostname === 'localhost',
  isProduction: window.location.hostname !== 'localhost',
  isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
};

// Export for global access
window.CONFIG = CONFIG;
window.VERSION = VERSION;
window.ENV = ENV;
