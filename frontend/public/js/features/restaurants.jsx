// ==================================
// RESTAURANTS MODULE
// ==================================

import { CONFIG } from '../core/config.jsx';
import { apiCall } from '../core/api.jsx';
import { ModalManager } from '../ui/navigation.jsx';
import { escapeHtml } from '../utils/utils.jsx';
import { getUserLocation } from '../ui/map.jsx';

// API Base URL for image loading
const API_BASE = "http://localhost:3000";

let restaurantMap = null;
let restaurantMarkers = [];
let userLocation = null;

// ==================================
// RESTAURANT DISCOVERY
// ==================================
export async function loadRestaurants() {
  try {
    console.log('🍽️ Loading restaurants from backend...');
    const result = await apiCall('/partners?category=dining');
    console.log('📡 Restaurant API Response:', result);
    
    if (result.success && result.data) {
      console.log(`✅ Loaded ${result.data.length} restaurants successfully`);
      
      // Calculate distances for each restaurant
      const restaurantsWithDistance = await Promise.all(
        result.data.map(async (restaurant) => {
          const distance = await getRestaurantDistance(restaurant);
          return {
            ...restaurant,
            distance: distance
          };
        })
      );
      
      return restaurantsWithDistance;
    } else {
      console.error('❌ Failed to load restaurants:', result.error);
      return [];
    }
  } catch (error) {
    console.error('💥 Error loading restaurants:', error);
    return [];
  }
}

// Alias for navigation.js compatibility
export const loadRestaurantsFromBackend = loadRestaurants;

export function renderRestaurantsList(restaurants) {
  const restaurantList = document.getElementById('restaurantList');
  if (!restaurantList) {
    console.error('❌ Restaurant list container not found!');
    return;
  }
  
  console.log('🎨 Rendering restaurants list:', restaurants);
  
  // Remove loading class
  restaurantList.classList.remove('loading');
  console.log('✅ Removed loading class from restaurantList');
  
  if (restaurants.length === 0) {
    restaurantList.innerHTML = `
      <div class="no-restaurants-modal" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
        min-height: 400px;
        background: linear-gradient(135deg, rgba(94, 23, 235, 0.05), rgba(36, 16, 95, 0.05));
        border-radius: 16px;
        margin: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      ">
        <div style="
          font-size: 80px;
          margin-bottom: 24px;
          animation: float 3s ease-in-out infinite;
        ">
          🍽️
        </div>
        <h2 style="
          font-size: 28px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        ">
          No Restaurants Available
        </h2>
        <p style="
          font-size: 16px;
          color: var(--muted);
          max-width: 400px;
          line-height: 1.6;
          margin-bottom: 32px;
        ">
          Check back later for new additions! We're partnering with amazing restaurants near you.
        </p>
        <button onclick="window.location.reload()" style="
          background: linear-gradient(135deg, #5E17EB, #24105F);
          color: white;
          padding: 14px 32px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(94, 23, 235, 0.3);
          transition: all 0.3s ease;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(94, 23, 235, 0.4)'" 
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(94, 23, 235, 0.3)'">
          🔄 Refresh
        </button>
      </div>
      <style>
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      </style>
    `;
    return;
  }
  
  // Handle image URLs properly (add API_BASE if relative path)
  restaurantList.innerHTML = restaurants.map(restaurant => {
    const rawImage = restaurant.image_url && String(restaurant.image_url).trim();
    const imgSrc = rawImage
      ? (rawImage.startsWith('http') ? rawImage : `${API_BASE}${rawImage}`)
      : '/assets/bukhara.jpg';
    
    return `
    <div class="restaurant-card" onclick="showRestaurantDetails('${restaurant.id}')">
      <div class="restaurant-image">
        <img src="${imgSrc}" alt="${escapeHtml(restaurant.name)}">
        ${(restaurant.co_pay_percentage || restaurant.discount_percentage) > 0 ? 
          `<div class="discount-badge">${(restaurant.co_pay_percentage || restaurant.discount_percentage)}% OFF</div>` : ''}
      </div>
      <div class="restaurant-info">
        <h3>${escapeHtml(restaurant.name)}</h3>
        <p>${escapeHtml(restaurant.description || 'Premium dining experience')}</p>
        <div class="restaurant-meta">
          <span class="distance">${restaurant.distance || 'N/A'}</span>
          <span class="rating">⭐ ${restaurant.rating || '4.5'}</span>
        </div>
        <div class="restaurant-features">
          <span class="cuisine">${restaurant.category || 'Dining'}</span>
          <span class="location">📍 ${restaurant.city || restaurant.address || 'Location'}</span>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// ==================================
// RESTAURANT DETAILS & BOOKING
// ==================================
export async function showRestaurantDetails(restaurantId, serviceType = null) {
  console.log('Showing details for restaurant:', restaurantId, 'Service Type:', serviceType);
  
  try {
    // Fetch restaurant details
    const response = await fetch(`${API_BASE}/api/v1/partners/${restaurantId}`);
    const data = await response.json();
    
    if (!data.success) {
      alert('Failed to load restaurant details');
      return;
    }
    
    const restaurant = data.data;
    
    // Fetch menu items
    const menuResponse = await fetch(`${API_BASE}/api/v1/partners/${restaurantId}/menu`);
    const menuData = await menuResponse.json();
    const allMenuItems = menuData.success ? menuData.data : [];
    
    // Determine current service type
    // Priority: 1. Function parameter, 2. URL parameter, 3. Partner default, 4. 'dining'
    const urlParams = new URLSearchParams(window.location.search);
    const currentServiceType = serviceType || 
                                urlParams.get('type') || 
                                restaurant.current_service_type || 
                                'dining';
    
    console.log('Current service type:', currentServiceType);
    
    // Filter menu items by service type
    const filteredMenuItems = allMenuItems.filter(item => {
      const itemServiceType = item.service_type || 'dining';
      return itemServiceType === currentServiceType;
    });
    
    console.log(`Filtered ${filteredMenuItems.length} items from ${allMenuItems.length} total (type: ${currentServiceType})`);
    
    // Show restaurant details modal or screen
    showRestaurantDetailsModal(restaurant, filteredMenuItems, currentServiceType, allMenuItems);
    
  } catch (error) {
    console.error('Error loading restaurant details:', error);
    alert('Failed to load restaurant details');
  }
}

function showRestaurantDetailsModal(restaurant, menuItems, currentServiceType = 'dining', allMenuItems = []) {
  // Get available service types from all menu items
  const availableServiceTypes = [...new Set(allMenuItems.map(item => item.service_type || 'dining'))];
  
  // Generate dynamic heading based on service type
  const getServiceHeading = (type) => {
    const headings = {
      'events': 'Events',
      'dining': 'Food Menu',
      'spa-and-salon': 'Spa & Salon Services',
      'wellness': 'Wellness Services',
      'travel': 'Travel Packages',
      'sports': 'Sports & Activities',
      'others': 'Services'
    };
    return headings[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };
  
  // Generate service type switcher buttons
  const serviceTypeSwitcher = availableServiceTypes.length > 1 ? `
    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; border-bottom: 1px solid #eee; padding-bottom: 12px;">
      ${availableServiceTypes.map(type => {
        const isActive = type === currentServiceType;
        const icons = {
          'dining': '🍽️',
          'events': '🎉',
          'spa-and-salon': '💆',
          'wellness': '🧘',
          'travel': '✈️',
          'sports': '⚽',
          'others': '📦'
        };
        return `
          <button 
            onclick="window.showRestaurantDetails('${restaurant.id}', '${type}')" 
            style="padding: 8px 16px; border: 2px solid ${isActive ? '#5E17EB' : '#ddd'}; background: ${isActive ? '#5E17EB' : 'white'}; color: ${isActive ? 'white' : '#666'}; border-radius: 8px; cursor: pointer; font-weight: ${isActive ? '600' : '400'}; transition: all 0.2s;">
            ${icons[type] || '📦'} ${getServiceHeading(type)}
          </button>
        `;
      }).join('')}
    </div>
  ` : '';
  
  // Inject CSS for menu items if not already present
  if (!document.getElementById('menuItemStyles')) {
    const style = document.createElement('style');
    style.id = 'menuItemStyles';
    style.textContent = `
      .menu-item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 1rem 0;
        border-bottom: 1px solid rgba(0,0,0,0.05);
        gap: 1rem;
      }
      
      .menu-item-left {
        flex-shrink: 0;
      }
      
      .menu-item-img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      }
      
      .menu-item-info {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
      }
      
      .menu-item-title {
        font-weight: 600;
        margin-bottom: 0.25rem;
        font-size: 15px;
      }
      
      .menu-item-desc {
        color: #666;
        font-size: 0.9rem;
        line-height: 1.4;
      }
      
      .menu-item-price {
        font-weight: 700;
        color: #5E17EB;
        white-space: nowrap;
        font-size: 16px;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Create modal HTML
  const modalHTML = `
    <div id="restaurantDetailsModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center;" onclick="closeRestaurantDetailsModal(event)">
      <div class="modal-content" style="background: white; border-radius: 16px; max-width: 600px; max-height: 90vh; overflow-y: auto; margin: 20px; width: 100%;" onclick="event.stopPropagation()">
        <div style="position: relative;">
          <img src="${restaurant.image_url || '/assets/bukhara.jpg'}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 16px 16px 0 0;" alt="${restaurant.name}">
          <button onclick="closeRestaurantDetailsModal()" style="position: absolute; top: 10px; right: 10px; background: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">×</button>
        </div>
        
        <div style="padding: 24px;">
          <h2 style="margin: 0 0 8px 0; font-size: 28px;">${restaurant.name}</h2>
          <p style="color: #666; margin: 0 0 16px 0;">${restaurant.description || 'Premium dining experience'}</p>
          
          <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
            ${restaurant.city ? `<div style="display: flex; align-items: center; gap: 4px;"><span>📍</span> ${restaurant.city}</div>` : ''}
            ${restaurant.rating ? `<div style="display: flex; align-items: center; gap: 4px;"><span>⭐</span> ${restaurant.rating}</div>` : ''}
            ${(restaurant.co_pay_percentage || restaurant.discount_percentage) > 0 ? `<div style="background: #10b981; color: white; padding: 4px 12px; border-radius: 8px; font-weight: 600;">${(restaurant.co_pay_percentage || restaurant.discount_percentage)}% OFF</div>` : ''}
          </div>
          
          ${restaurant.address ? `<p style="color: #666; margin-bottom: 16px;"><strong>Address:</strong> ${restaurant.address}</p>` : ''}
          ${restaurant.phone_number ? `<p style="color: #666; margin-bottom: 16px;"><strong>Phone:</strong> ${restaurant.phone_number}</p>` : ''}
          
          ${serviceTypeSwitcher}
          
          <h3 id="menuHeading" style="margin: 24px 0 16px 0; font-size: 20px;">${getServiceHeading(currentServiceType)}</h3>
          ${menuItems.length > 0 ? renderMenuItems(menuItems) : `<p style="color: #666;">No ${getServiceHeading(currentServiceType).toLowerCase()} available</p>`}
          
          <button onclick="closeRestaurantDetailsModal()" style="width: 100%; padding: 16px; background: #5E17EB; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px;">Close</button>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existing = document.getElementById('restaurantDetailsModal');
  if (existing) existing.remove();
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function renderMenuItems(menuItems) {
  // Group by category
  const grouped = {};
  menuItems.forEach(item => {
    const category = item.category || 'Other';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(item);
  });
  
  let html = '';
  for (const [category, items] of Object.entries(grouped)) {
    html += `
      <div style="margin-bottom: 24px;">
        <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #5E17EB; text-transform: capitalize;">${category.replace(/-/g, ' ')}</h4>
        ${items.map(item => {
          // Handle image URL
          const imgSrc = item.image_url
            ? (item.image_url.startsWith('http') ? item.image_url : `${API_BASE}${item.image_url}`)
            : '/assets/placeholder-food.png';
          
          return `
            <div class="menu-item">
              <div class="menu-item-left">
                <img src="${imgSrc}" alt="${item.name}" class="menu-item-img" loading="lazy">
              </div>
              <div class="menu-item-info">
                <div class="menu-item-title">${item.name}</div>
                ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
              </div>
              <div class="menu-item-price">₹${Number(item.price || 0).toFixed(2)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  return html;
}

window.closeRestaurantDetailsModal = function(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('restaurantDetailsModal');
  if (modal) modal.remove();
}

export function showRestaurantBookingModal(restaurantId) {
  ModalManager.show('restaurantBookingModal');
  // Implementation would go here
}

export async function bookRestaurant(restaurantId, guests, date, time, specialRequests = '') {
  try {
    const result = await apiCall('/eznet/book-restaurant', 'POST', {
      restaurant_id: restaurantId,
      guests: guests,
      date: date,
      time: time,
      special_requests: specialRequests
    });
    
    return result;
  } catch (error) {
    console.error('Error booking restaurant:', error);
    throw error;
  }
}

// ==================================
// LOCATION SERVICES
// ==================================
// getUserLocation function moved to map.js to avoid duplication

export async function getRestaurantDistance(restaurant) {
  if (!userLocation) {
    await getUserLocation();
  }
  
  if (restaurant.latitude && restaurant.longitude && userLocation) {
    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lng,
      restaurant.latitude,
      restaurant.longitude
    );
    return formatDistance(distance);
  }
  
  return 'N/A';
}

// ==================================
// MAP INTEGRATION
// ==================================
export function initializeRestaurantMap() {
  if (restaurantMap) return;
  
  restaurantMap = L.map('restaurantMap').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(restaurantMap);
}

export function addRestaurantMarker(restaurant) {
  if (!restaurantMap || !restaurant.latitude || !restaurant.longitude) return;
  
  const marker = L.marker([restaurant.latitude, restaurant.longitude])
    .addTo(restaurantMap)
    .bindPopup(`
      <div>
        <h3>${escapeHtml(restaurant.name)}</h3>
        <p>${escapeHtml(restaurant.description || '')}</p>
        ${restaurant.partner_discount_percentage > 0 ? 
          `<p><strong>${restaurant.partner_discount_percentage}% off</strong></p>` : ''}
        <button onclick="showRestaurantDetails('${restaurant.id}')" class="btn">View Details</button>
      </div>
    `);
  
  restaurantMarkers.push(marker);
}

export function clearMapMarkers() {
  restaurantMarkers.forEach(marker => marker.remove());
  restaurantMarkers = [];
}

// ==================================
// FILTERING & SEARCH
// ==================================
export function filterRestaurants(restaurants, filters) {
  return restaurants.filter(restaurant => {
    // Cuisine filter
    if (filters.cuisine && restaurant.cuisine_type !== filters.cuisine) {
      return false;
    }
    
    // Price range filter
    if (filters.priceRange && restaurant.price_range !== filters.priceRange) {
      return false;
    }
    
    // Distance filter
    if (filters.maxDistance && restaurant.distance) {
      const distance = parseFloat(restaurant.distance);
      if (distance > filters.maxDistance) {
        return false;
      }
    }
    
    // Rating filter
    if (filters.minRating && restaurant.rating < filters.minRating) {
      return false;
    }
    
    return true;
  });
}

export function searchRestaurants(restaurants, query) {
  if (!query) return restaurants;
  
  const searchTerm = query.toLowerCase();
  return restaurants.filter(restaurant => 
    restaurant.name.toLowerCase().includes(searchTerm) ||
    restaurant.description.toLowerCase().includes(searchTerm) ||
    restaurant.cuisine_type.toLowerCase().includes(searchTerm)
  );
}

// ==================================
// EXPORTS FOR GLOBAL ACCESS
// ==================================
window.loadRestaurants = loadRestaurants;
window.renderRestaurantsList = renderRestaurantsList;
window.showRestaurantDetails = showRestaurantDetails;
window.showRestaurantBookingModal = showRestaurantBookingModal;
window.bookRestaurant = bookRestaurant;
// window.getUserLocation = getUserLocation; // Removed - already declared in map.js
window.getRestaurantDistance = getRestaurantDistance;
window.initializeRestaurantMap = initializeRestaurantMap;
window.addRestaurantMarker = addRestaurantMarker;
window.clearMapMarkers = clearMapMarkers;
window.filterRestaurants = filterRestaurants;
window.searchRestaurants = searchRestaurants;
