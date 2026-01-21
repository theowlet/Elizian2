/**
 * @module api
 * @description Centralized API client with error handling and retry logic
 * @author Elizian Team
 * @version 1.0.0
 */

import { CONFIG } from './config';
import { getAuthToken, logout } from './auth';
import { showNotification } from '../ui/notifications';

// ==========================================
// API CLIENT
// ==========================================

/**
 * Make API call with standard error handling and retry logic
 * @param {string} endpoint - API endpoint (e.g., '/events')
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} data - Request body (for POST/PUT)
 * @param {Object} options - Additional options {retries, timeout}
 * @returns {Promise<Object>} Response object {success, data, error, statusCode}
 */
export async function apiCall(endpoint, method = 'GET', data = null, options = {}) {
  const { retries = CONFIG.UI.maxRetries, timeout = CONFIG.UI.loadingTimeout } = options;
  
  const config = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // Add auth token if available
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add request body
  if (data) {
    config.body = JSON.stringify(data);
  }
  
  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, config);
    clearTimeout(timeoutId);
    
    const result = await response.json();
    
    // Handle 401 (Unauthorized)
    if (response.status === 401) {
      handleUnauthorized();
      return {
        success: false,
        error: CONFIG.ERRORS.UNAUTHORIZED,
        statusCode: 401
      };
    }
    
    // Handle other errors
    if (!response.ok) {
      return {
        success: false,
        error: result.error || CONFIG.ERRORS.SERVER,
        statusCode: response.status
      };
    }
    
    return result;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle timeout
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: CONFIG.ERRORS.TIMEOUT,
        statusCode: 0
      };
    }
    
    // Handle network errors
    if (!navigator.onLine) {
      return {
        success: false,
        error: CONFIG.ERRORS.NETWORK,
        statusCode: 0
      };
    }
    
    console.error(`[API] ${method} ${endpoint} failed:`, error);
    
    // Retry logic for network errors
    if (retries > 0 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
      console.log(`[API] Retrying ${method} ${endpoint} (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return apiCall(endpoint, method, data, { ...options, retries: retries - 1 });
    }
    
    return {
      success: false,
      error: error.message || CONFIG.ERRORS.NETWORK,
      statusCode: 0
    };
  }
}

/**
 * Handle unauthorized access (401)
 * @private
 */
function handleUnauthorized() {
  showNotification(CONFIG.ERRORS.UNAUTHORIZED, 'error');
  setTimeout(() => logout(), 2000);
}

// ==========================================
// CONVENIENCE METHODS
// ==========================================

/**
 * GET request
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export function get(endpoint, options = {}) {
  return apiCall(endpoint, 'GET', null, options);
}

/**
 * POST request
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export function post(endpoint, data, options = {}) {
  return apiCall(endpoint, 'POST', data, options);
}

/**
 * PUT request
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export function put(endpoint, data, options = {}) {
  return apiCall(endpoint, 'PUT', data, options);
}

/**
 * DELETE request
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export function del(endpoint, options = {}) {
  return apiCall(endpoint, 'DELETE', null, options);
}

// ==========================================
// API OBJECT FOR CONVENIENCE
// ==========================================
export const api = {
  get,
  post,
  put,
  delete: del,
  call: apiCall
};

// ==========================================
// EXPORTS
// ==========================================
export default api;