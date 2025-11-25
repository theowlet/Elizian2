# LocationService Documentation

## Overview
LocationService provides comprehensive location detection and management for the Elizian app, including:
- Browser Geolocation API integration
- Reverse geocoding (coordinates → readable addresses)
- Distance calculations using Haversine formula
- Location caching (1 hour)
- Fallback to Delhi when location unavailable
- Automatic UI updates

## Features

### ✅ Automatic Location Detection
- Requests location permission on app load
- Caches location for 1 hour to avoid repeated API calls
- Falls back to Delhi if permission denied

### ✅ Reverse Geocoding
- Converts GPS coordinates to readable addresses
- Uses OpenStreetMap Nominatim (free, no API key required)
- Returns: city, area, state, country

### ✅ Distance Calculations
- Haversine formula for accurate distances
- Calculate distance to any partner/deal
- Sort items by distance
- Check if user is within range

### ✅ UI Integration
- Automatically updates location header
- Shows "Getting location..." while loading
- Permission modal if location denied

## Usage

### Basic Usage

```javascript
// LocationService is auto-initialized on page load
// Access via window.locationService

// Get current location
const location = window.locationService.getCurrentLocation();
console.log(location);
// {
//   latitude: 28.4595,
//   longitude: 77.0266,
//   city: "Gurugram",
//   area: "Sector 47",
//   state: "Haryana",
//   country: "India",
//   timestamp: 1234567890
// }
```

### Calculate Distance to Partner

```javascript
// Get distance to a partner/deal
const distance = window.locationService.getDistanceToPartner(
  partnerLat,
  partnerLon
);

console.log(distance);
// {
//   km: 2.345,
//   formatted: "2.3 km"
// }

// Use in UI
dealElement.innerHTML = `
  <p>📍 ${distance.formatted} away</p>
`;
```

### Sort Deals by Distance

```javascript
// Sort an array of deals by distance from user
const deals = [
  { id: 1, name: "Deal 1", latitude: 28.4595, longitude: 77.0266 },
  { id: 2, name: "Deal 2", latitude: 28.5355, longitude: 77.3910 },
  // ...
];

const sortedDeals = window.locationService.sortByDistance(deals);
// Returns deals with 'distance' property, sorted nearest first
```

### Check if Within Range

```javascript
// Check if user is within 10km of a location
const isNearby = window.locationService.isWithinRange(
  partnerLat,
  partnerLon,
  10 // radius in km
);

if (isNearby) {
  console.log("Partner is nearby!");
}
```

### Manual Location Refresh

```javascript
// Clear cache and request new location
window.locationService.clearCache();
const newLocation = await window.locationService.initializeLocation();
```

### Get Location Bounds for API Queries

```javascript
// Get lat/lon bounds for searching within radius
const bounds = window.locationService.getLocationBounds(25); // 25km radius
console.log(bounds);
// {
//   minLat: 28.2345,
//   maxLat: 28.6845,
//   minLon: 76.7766,
//   maxLon: 77.2766,
//   centerLat: 28.4595,
//   centerLon: 77.0266,
//   radiusKm: 25
// }

// Use in API query
const response = await fetch(`/api/deals?minLat=${bounds.minLat}&maxLat=${bounds.maxLat}`);
```

## API Reference

### Methods

#### `initializeLocation()`
Initializes location detection on app load.
```javascript
await window.locationService.initializeLocation();
```

#### `getCurrentLocation()`
Returns the current location (from cache or memory).
```javascript
const location = window.locationService.getCurrentLocation();
```

#### `calculateDistance(lat1, lon1, lat2, lon2)`
Calculates distance in kilometers between two points.
```javascript
const distanceKm = window.locationService.calculateDistance(
  28.4595, 77.0266,
  28.5355, 77.3910
);
```

#### `formatDistance(distanceKm)`
Formats distance for display.
```javascript
const formatted = window.locationService.formatDistance(2.345);
// "2.3 km"

const formatted2 = window.locationService.formatDistance(0.5);
// "500 m"
```

#### `getDistanceToPartner(lat, lon)`
Gets distance from user to a partner/deal.
```javascript
const distance = window.locationService.getDistanceToPartner(
  partner.latitude,
  partner.longitude
);
// { km: 2.345, formatted: "2.3 km" }
```

#### `sortByDistance(items, latKey, lonKey)`
Sorts array of items by distance from user.
```javascript
const sorted = window.locationService.sortByDistance(
  deals,
  'latitude',  // optional, defaults to 'latitude'
  'longitude'  // optional, defaults to 'longitude'
);
```

#### `isWithinRange(lat, lon, rangeKm)`
Checks if user is within specified range of a location.
```javascript
const isNearby = window.locationService.isWithinRange(
  partner.latitude,
  partner.longitude,
  10 // 10km radius
);
```

#### `getLocationBounds(radiusKm)`
Gets lat/lon bounds for API queries.
```javascript
const bounds = window.locationService.getLocationBounds(25);
```

#### `clearCache()`
Clears cached location (forces fresh detection).
```javascript
window.locationService.clearCache();
```

## Configuration

### Cache Duration
Location is cached for 1 hour by default. Change in constructor:
```javascript
this.cacheExpiry = 60 * 60 * 1000; // 1 hour in ms
```

### Fallback Location
Default fallback is Delhi. Change in constructor:
```javascript
this.fallbackLocation = {
  latitude: 28.6139,
  longitude: 77.2090,
  city: 'Delhi',
  area: 'Central Delhi',
  state: 'Delhi',
  country: 'India',
  timestamp: Date.now()
};
```

## Error Handling

The service handles errors gracefully:
- If browser doesn't support geolocation → fallback to Delhi
- If permission denied → show modal, then use fallback
- If reverse geocoding fails → use coordinates as area name
- If cache corrupted → clear and request new location

## Browser Compatibility

- ✅ Chrome 5+
- ✅ Firefox 3.5+
- ✅ Safari 5+
- ✅ Edge 12+
- ✅ iOS Safari 3.2+
- ✅ Android Browser 2.1+

## Privacy & Permissions

- Location is only requested once per hour (or on cache clear)
- No data is sent to external servers except OpenStreetMap for reverse geocoding
- User can deny permission - app still works with fallback location
- Location is stored in browser's localStorage, not on server

## Example: Displaying Nearest Deals

```javascript
async function displayNearestDeals() {
  // Get all deals from API
  const response = await fetch('/api/deals');
  const deals = await response.json();
  
  // Sort by distance
  const sorted = window.locationService.sortByDistance(deals.data);
  
  // Display with distances
  const container = document.getElementById('dealsContainer');
  container.innerHTML = sorted.map(deal => {
    const distance = window.locationService.formatDistance(deal.distance);
    return `
      <div class="deal-card">
        <h3>${deal.title}</h3>
        <p>📍 ${distance} away</p>
        <p>${deal.partner_name}</p>
      </div>
    `;
  }).join('');
}
```

## Debugging

Enable console logs to see location detection flow:
```javascript
// All location-related logs are prefixed with emojis:
// 📍 = initialization
// ✅ = success
// ⚠️ = warning
// ❌ = error
// 💾 = cache operations
// 🔍 = requesting location
```

## Support

For issues or questions, check:
- Browser console for error messages
- localStorage key: `elizian_user_location`
- Permission settings in browser

## Future Enhancements

- [ ] Save favorite locations
- [ ] Location history
- [ ] Custom location search
- [ ] Google Maps geocoding (if API key available)
- [ ] Offline location support

