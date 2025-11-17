/**
 * @module map
 * @description Map integration with proper cleanup and error handling
 * @author Elizian Team
 * @version 1.0.0
 */

import { CONFIG } from '../core/config.js';
import { calculateDistance } from '../utils/utils.js';
import { escapeHtml } from '../utils/utils.js';

// ==========================================
// MAP STATE
// ==========================================
let restaurantMap = null;
let restaurantMarkers = [];
let proximityIntervalId = null;

// ==========================================
// MAP INITIALIZATION
// ==========================================

/**
 * Initialize restaurant map with proper cleanup
 * @returns {void}
 */
export function initializeRestaurantMap() {
  const mapContainer = document.getElementById('restaurantMap');
  
  if (!mapContainer) {
    console.error('[map] Map container not found');
    return;
  }
  
  // ✅ Clean up old map instance
  if (restaurantMap) {
    try {
      restaurantMap.remove();
      restaurantMap = null;
    } catch (error) {
      console.error('[map] Error removing old map:', error);
    }
  }
  
  // ✅ Initialize fresh map
  try {
    restaurantMap = L.map(mapContainer).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(restaurantMap);
    
    console.log('[map] Map initialized successfully');
  } catch (error) {
    console.error('[map] Error initializing map:', error);
  }
}

/**
 * Add restaurant markers to map
 * @param {Array} restaurants - Array of restaurant objects
 * @returns {void}
 */
export function addRestaurantMarkers(restaurants) {
  if (!restaurantMap) {
    console.error('[map] Map not initialized');
    return;
  }
  
  // Clear existing markers
  clearMapMarkers();
  
  restaurants.forEach(restaurant => {
    if (restaurant.latitude && restaurant.longitude) {
      try {
        const marker = L.marker([restaurant.latitude, restaurant.longitude])
          .addTo(restaurantMap)
          .bindPopup(`
            <div class="map-popup">
              <h3>${escapeHtml(restaurant.name)}</h3>
              <p>${escapeHtml(restaurant.description || '')}</p>
              ${restaurant.partner_discount_percentage > 0 ? 
                `<p><strong>${restaurant.partner_discount_percentage}% off</strong></p>` : ''}
              <button onclick="showRestaurantDetails('${restaurant.id}')" class="btn">View Details</button>
            </div>
          `);
        
        restaurantMarkers.push(marker);
      } catch (error) {
        console.error('[map] Error adding marker:', error);
      }
    }
  });
}

/**
 * Clear all map markers
 * @returns {void}
 */
export function clearMapMarkers() {
  restaurantMarkers.forEach(marker => {
    try {
      marker.remove();
    } catch (error) {
      console.error('[map] Error removing marker:', error);
    }
  });
  restaurantMarkers = [];
}

/**
 * Clean up map resources
 * @returns {void}
 */
export function cleanupMap() {
  // Skip if React app is detected (has #root element) - React handles its own cleanup
  if (document.getElementById('root')) {
    return;
  }
  
  // Clean up map
  if (restaurantMap) {
    try {
      restaurantMap.remove();
      restaurantMap = null;
    } catch (error) {
      console.error('[map] Error cleaning up map:', error);
    }
  }
  
  // Clean up markers
  clearMapMarkers();
  
  // Clean up proximity detection
  cleanupProximityDetection();
  
  console.log('[map] Map cleanup completed');
}

// ==========================================
// LOCATION FUNCTIONS
// ==========================================

/**
 * Get user's current location
 * @param {boolean} forceFresh - Force fresh location
 * @returns {Promise<Object>} Location object
 */
export async function getUserLocation(forceFresh = false) {
  return new Promise((resolve) => {
    const cachedLocation = JSON.parse(localStorage.getItem('userLocation') || '{}');
    const now = new Date().getTime();

    if (!forceFresh && cachedLocation.latitude && cachedLocation.timestamp && (now - cachedLocation.timestamp < 300000)) {
      console.log('[map] Using cached location:', cachedLocation);
      resolve(cachedLocation);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: now
          };
          localStorage.setItem('userLocation', JSON.stringify(location));
          console.log('[map] Real-time location detected:', location);
          resolve(location);
        },
        (error) => {
          console.warn('[map] Geolocation error:', error);
          // Fallback to default location
          const fallbackLocation = { 
            latitude: CONFIG.MAP_CENTER[0], 
            longitude: CONFIG.MAP_CENTER[1], 
            timestamp: now 
          };
          localStorage.setItem('userLocation', JSON.stringify(fallbackLocation));
          console.log('[map] Using fallback location:', fallbackLocation);
          resolve(fallbackLocation);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: forceFresh ? 0 : 300000
        }
      );
    } else {
      console.warn('[map] Geolocation is not supported by this browser.');
      const fallbackLocation = { 
        latitude: CONFIG.MAP_CENTER[0], 
        longitude: CONFIG.MAP_CENTER[1], 
        timestamp: now 
      };
      localStorage.setItem('userLocation', JSON.stringify(fallbackLocation));
      resolve(fallbackLocation);
    }
  });
}

/**
 * Calculate distance between two points
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} Distance in kilometers
 */
// calculateDistance function moved to utils.js to avoid duplication

/**
 * Get distance to partner
 * @param {number} partnerLat - Partner latitude
 * @param {number} partnerLon - Partner longitude
 * @returns {Promise<string>} Formatted distance string
 */
export async function getPartnerDistance(partnerLat, partnerLon) {
  const userLocation = await getUserLocation();
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    const distance = calculateDistance(userLocation.latitude, userLocation.longitude, partnerLat, partnerLon);
    return distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(1)} km`;
  }
  return 'N/A';
}

// ==========================================
// PROXIMITY DETECTION
// ==========================================

/**
 * Enable proximity detection with cleanup
 * @returns {void}
 */
export function enableProximityDetection() {
  // ✅ Clean up any existing interval first
  cleanupProximityDetection();
  
  let distance = 15;
  
  proximityIntervalId = setInterval(async () => {
    try {
      distance -= Math.random() * 2;
      
      const proximityIndicator = document.getElementById('proximityIndicator');
      const proximityText = document.getElementById('proximityText');
      const distanceText = document.getElementById('distanceText');
      
      if (proximityIndicator && proximityText && distanceText) {
        if (distance <= 2) {
          proximityIndicator.style.backgroundColor = 'var(--success)';
          proximityText.textContent = 'You are near a partner location!';
          distanceText.textContent = `${distance.toFixed(1)} km away`;
          
          // Clean up when proximity is reached
          cleanupProximityDetection();
        } else {
          proximityIndicator.style.backgroundColor = 'var(--muted)';
          proximityText.textContent = 'Not near any partner location';
          distanceText.textContent = `${distance.toFixed(1)} km away`;
        }
      }
    } catch (error) {
      console.error('[map] Proximity detection error:', error);
    }
  }, 500);
  
  console.log('[map] Proximity detection enabled');
}

/**
 * Clean up proximity detection
 * @returns {void}
 */
export function cleanupProximityDetection() {
  if (proximityIntervalId) {
    clearInterval(proximityIntervalId);
    proximityIntervalId = null;
    console.log('[map] Proximity detection cleaned up');
  }
}

// ==========================================
// EXPORTS FOR GLOBAL ACCESS
// ==========================================
window.initializeRestaurantMap = initializeRestaurantMap;
window.addRestaurantMarkers = addRestaurantMarkers;
window.clearMapMarkers = clearMapMarkers;
window.cleanupMap = cleanupMap;
// window.getUserLocation = getUserLocation; // Removed - imported as module
// window.calculateDistance = calculateDistance; // Removed - imported as module
window.getPartnerDistance = getPartnerDistance;
window.enableProximityDetection = enableProximityDetection;
window.cleanupProximityDetection = cleanupProximityDetection;