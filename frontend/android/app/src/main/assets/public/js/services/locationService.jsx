/**
 * LocationService - Comprehensive location detection and management
 * Features:
 * - Browser Geolocation API
 * - Reverse Geocoding (OpenStreetMap)
 * - Caching (1 hour)
 * - Distance calculations (Haversine formula)
 * - Fallback to Delhi
 * - UI updates
 */

class LocationService {
  constructor() {
    this.currentLocation = null;
    this.cacheKey = 'elizian_user_location';
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour in milliseconds
    this.fallbackLocation = {
      latitude: 28.6139,
      longitude: 77.2090,
      city: 'Delhi',
      area: 'Central Delhi',
      state: 'Delhi',
      country: 'India',
      timestamp: Date.now()
    };
  }

  /**
   * Initialize location on app load
   */
  async initializeLocation() {
    try {
      console.log('📍 Initializing location service...');
      
      // Check cache first
      const cachedLocation = this.getCachedLocation();
      if (cachedLocation) {
        console.log('✅ Using cached location:', cachedLocation);
        this.currentLocation = cachedLocation;
        this.updateLocationUI(cachedLocation);
        return cachedLocation;
      }

      // Request new location
      const location = await this.requestLocation();
      if (location) {
        this.currentLocation = location;
        this.cacheLocation(location);
        this.updateLocationUI(location);
        return location;
      }

      // Fallback
      console.warn('⚠️ Using fallback location (Delhi)');
      this.currentLocation = this.fallbackLocation;
      this.updateLocationUI(this.fallbackLocation);
      return this.fallbackLocation;

    } catch (error) {
      console.error('❌ Location initialization error:', error);
      this.currentLocation = this.fallbackLocation;
      this.updateLocationUI(this.fallbackLocation);
      return this.fallbackLocation;
    }
  }

  /**
   * Request location from browser
   */
  async requestLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.error('❌ Geolocation not supported');
        reject(new Error('Geolocation not supported'));
        return;
      }

      console.log('🔍 Requesting browser location...');

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          console.log(`✅ Got coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

          try {
            // Reverse geocode to get readable address
            const address = await this.reverseGeocode(latitude, longitude);
            const location = {
              latitude,
              longitude,
              ...address,
              timestamp: Date.now()
            };
            resolve(location);
          } catch (error) {
            console.error('❌ Reverse geocoding failed:', error);
            // Return coordinates without address
            resolve({
              latitude,
              longitude,
              city: 'Unknown',
              area: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
              state: '',
              country: 'India',
              timestamp: Date.now()
            });
          }
        },
        (error) => {
          console.warn('⚠️ Geolocation error:', error.message);
          
          // Show permission modal if needed
          if (error.code === error.PERMISSION_DENIED) {
            this.showLocationPermissionModal();
          }
          
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  /**
   * Reverse geocode coordinates to address using OpenStreetMap Nominatim
   */
  async reverseGeocode(latitude, longitude) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Elizian App'
        }
      });

      if (!response.ok) {
        throw new Error('Reverse geocoding failed');
      }

      const data = await response.json();
      const address = data.address || {};

      return {
        city: address.city || address.town || address.village || address.state_district || 'Unknown',
        area: address.suburb || address.neighbourhood || address.road || address.hamlet || 'Near you',
        state: address.state || '',
        country: address.country || 'India',
        fullAddress: data.display_name || ''
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      throw error;
    }
  }

  /**
   * Get current location (from cache or memory)
   */
  getCurrentLocation() {
    return this.currentLocation || this.getCachedLocation() || this.fallbackLocation;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance; // km
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format distance for display
   */
  formatDistance(distanceKm) {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)} m`;
    } else if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)} km`;
    } else {
      return `${Math.round(distanceKm)} km`;
    }
  }

  /**
   * Cache location in localStorage
   */
  cacheLocation(location) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(location));
      console.log('💾 Location cached');
    } catch (error) {
      console.error('Failed to cache location:', error);
    }
  }

  /**
   * Get cached location if valid
   */
  getCachedLocation() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const location = JSON.parse(cached);
      const age = Date.now() - location.timestamp;

      if (age < this.cacheExpiry) {
        console.log(`📦 Cache hit (age: ${Math.round(age / 1000 / 60)}min)`);
        return location;
      } else {
        console.log('🕐 Cache expired');
        localStorage.removeItem(this.cacheKey);
        return null;
      }
    } catch (error) {
      console.error('Failed to read cache:', error);
      return null;
    }
  }

  /**
   * Clear cached location
   */
  clearCache() {
    localStorage.removeItem(this.cacheKey);
    console.log('🗑️ Location cache cleared');
  }

  /**
   * Update UI with location information
   */
  updateLocationUI(location) {
    try {
      // Update main location display
      const locationNameEl = document.getElementById('locationName');
      const locationCityEl = document.getElementById('locationCity');

      if (locationNameEl) {
        locationNameEl.innerHTML = `${location.area} <span>▼</span>`;
      }

      if (locationCityEl) {
        locationCityEl.textContent = location.city;
      }

      // Update home feed location
      const homeLoc = document.getElementById('homeLocation');
      if (homeLoc) {
        homeLoc.textContent = `Around ${location.area} • ${location.city}`;
      }

      console.log('✅ UI updated with location:', location.area, location.city);
    } catch (error) {
      console.error('Failed to update UI:', error);
    }
  }

  /**
   * Show permission modal for location access
   */
  showLocationPermissionModal() {
    const modalHTML = `
      <div class="modal-backdrop" id="locationPermissionModal" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      ">
        <div class="modal-content" style="
          background: white;
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          margin: 20px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
        ">
          <div style="text-align: center; margin-bottom: 16px; font-size: 48px;">
            📍
          </div>
          <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; text-align: center;">
            Enable Location Access
          </h3>
          <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; line-height: 1.5;">
            We need your location to show nearby deals and calculate distances to partners.
          </p>
          <div style="display: flex; gap: 12px;">
            <button onclick="window.locationService.closePermissionModal()" style="
              flex: 1;
              padding: 12px;
              border: 1px solid #E5E7EB;
              border-radius: 8px;
              background: white;
              color: #374151;
              font-weight: 500;
              cursor: pointer;
            ">
              Use Default
            </button>
            <button onclick="window.locationService.retryLocationRequest()" style="
              flex: 1;
              padding: 12px;
              border: none;
              border-radius: 8px;
              background: linear-gradient(135deg, #5E17EB 0%, #24105F 100%);
              color: white;
              font-weight: 600;
              cursor: pointer;
            ">
              Enable Location
            </button>
          </div>
        </div>
      </div>
    `;

    const existingModal = document.getElementById('locationPermissionModal');
    if (existingModal) {
      existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Close permission modal
   */
  closePermissionModal() {
    const modal = document.getElementById('locationPermissionModal');
    if (modal) {
      modal.remove();
    }
  }

  /**
   * Retry location request (opens browser settings)
   */
  async retryLocationRequest() {
    this.closePermissionModal();
    alert('Please enable location access in your browser settings and refresh the page.');
  }

  /**
   * Get distance to a partner/deal
   */
  getDistanceToPartner(partnerLat, partnerLon) {
    const userLocation = this.getCurrentLocation();
    if (!userLocation || !partnerLat || !partnerLon) {
      return null;
    }

    const distance = this.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      partnerLat,
      partnerLon
    );

    return {
      km: distance,
      formatted: this.formatDistance(distance)
    };
  }

  /**
   * Sort partners/deals by distance
   */
  sortByDistance(items, latKey = 'latitude', lonKey = 'longitude') {
    const userLocation = this.getCurrentLocation();
    if (!userLocation) return items;

    return items.map(item => {
      const distance = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        item[latKey],
        item[lonKey]
      );
      return { ...item, distance };
    }).sort((a, b) => a.distance - b.distance);
  }

  /**
   * Check if user is within range of a location
   */
  isWithinRange(targetLat, targetLon, rangeKm = 10) {
    const userLocation = this.getCurrentLocation();
    if (!userLocation || !targetLat || !targetLon) {
      return false;
    }

    const distance = this.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      targetLat,
      targetLon
    );

    return distance <= rangeKm;
  }

  /**
   * Get location bounds for API queries
   */
  getLocationBounds(radiusKm = 25) {
    const userLocation = this.getCurrentLocation();
    if (!userLocation) {
      return null;
    }

    // Approximate: 1 degree latitude ≈ 111 km
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos(this.toRad(userLocation.latitude)));

    return {
      minLat: userLocation.latitude - latDelta,
      maxLat: userLocation.latitude + latDelta,
      minLon: userLocation.longitude - lonDelta,
      maxLon: userLocation.longitude + lonDelta,
      centerLat: userLocation.latitude,
      centerLon: userLocation.longitude,
      radiusKm
    };
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.LocationService = LocationService;
}

// Auto-initialize if in browser environment
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.locationService) {
      console.log('🚀 Auto-initializing LocationService...');
      window.locationService = new LocationService();
      await window.locationService.initializeLocation();
    }
  });
}

