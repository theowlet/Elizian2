const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Service types for offers/menu items
const SERVICE_TYPES = [
  { key: 'dining', label: 'Dining', icon: '🍽️' },
  { key: 'events', label: 'Events', icon: '🎉' },
  { key: 'spa-and-salon', label: 'Spa & Salon', icon: '💆' },
  { key: 'wellness', label: 'Wellness', icon: '🧘' },
  { key: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { key: 'travel', label: 'Travel', icon: '✈️' },
  { key: 'others', label: 'Others', icon: '📦' }
];

// Service categories (similar to service types but for categorization)
const SERVICE_CATEGORIES = [
  { id: 'dining', name: 'Dining', icon: '🍽️', description: 'Restaurants, cafes, and food services' },
  { id: 'events', name: 'Events', icon: '🎉', description: 'Concerts, workshops, and experiences' },
  { id: 'spa-and-salon', name: 'Spa & Salon', icon: '💆', description: 'Beauty and relaxation services' },
  { id: 'wellness', name: 'Wellness', icon: '🧘', description: 'Fitness, yoga, and health services' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥', description: 'Medical and health services' },
  { id: 'travel', name: 'Travel', icon: '✈️', description: 'Travel and tourism services' },
  { id: 'others', name: 'Others', icon: '📦', description: 'Other services' }
];

async function getServiceTypes(req, res) {
  try {
    successResponse(res, 200, 'Service types retrieved successfully', {
      service_types: SERVICE_TYPES,
      count: SERVICE_TYPES.length
    });
  } catch (err) {
    logError('Service types fetch error:', err);
    errorResponse(res, 500, 'Failed to fetch service types');
  }
}

async function getServiceCategories(req, res) {
  try {
    successResponse(res, 200, 'Service categories retrieved successfully', {
      categories: SERVICE_CATEGORIES,
      count: SERVICE_CATEGORIES.length
    });
  } catch (err) {
    logError('Service categories fetch error:', err);
    errorResponse(res, 500, 'Failed to fetch service categories');
  }
}

module.exports = {
  getServiceTypes,
  getServiceCategories
};

