/**
 * Category Mapper Utility
 * Unified mapping between frontend categories and backend service types
 */

/**
 * The 7 core categories supported by Elizian
 */
export const CATEGORIES = {
  DINING: 'dining',
  EVENTS: 'events',
  SPA: 'spa',
  WELLNESS: 'wellness',
  HEALTHCARE: 'healthcare',
  TRAVEL: 'travel',
  OTHERS: 'others'
};

/**
 * Maps frontend category slugs to backend service_type values
 */
export const CATEGORY_TO_SERVICE_TYPE = {
  'dining': 'dining',
  'events': 'events',
  'healthcare': 'healthcare',
  'spa': 'spa-and-salon',
  'wellness': 'wellness',
  'travel': 'travel',
  'others': 'others',
  'all': null // null means no filter
};

/**
 * Maps backend service_type to frontend category slug
 */
export const SERVICE_TYPE_TO_CATEGORY = {
  'dining': 'dining',
  'events': 'events',
  'healthcare': 'healthcare',
  'spa-and-salon': 'spa',
  'spa': 'spa',
  'wellness': 'wellness',
  'travel': 'travel',
  'others': 'others'
};

/**
 * Category display metadata
 */
export const CATEGORY_METADATA = {
  'dining': {
    icon: '🍽️',
    label: 'Dining',
    color: '#FF6B6B',
    description: 'Restaurants, cafes, and food experiences'
  },
  'events': {
    icon: '🎉',
    label: 'Events',
    color: '#4ECDC4',
    description: 'Concerts, shows, and entertainment'
  },
  'spa': {
    icon: '💆',
    label: 'Spa & Salon',
    color: '#95E1D3',
    description: 'Relaxation and beauty services'
  },
  'wellness': {
    icon: '🧘',
    label: 'Wellness',
    color: '#F38181',
    description: 'Fitness, yoga, and wellness'
  },
  'healthcare': {
    icon: '🩺',
    label: 'Healthcare',
    color: '#AA96DA',
    description: 'Medical and health services'
  },
  'travel': {
    icon: '✈️',
    label: 'Travel',
    color: '#FCBAD3',
    description: 'Travel and tourism services'
  },
  'others': {
    icon: '📦',
    label: 'More',
    color: '#A8DADC',
    description: 'Other services and offers'
  }
};

/**
 * Converts frontend category to backend service_type
 * @param {string} category - Frontend category slug
 * @returns {string|null} - Backend service_type or null for 'all'
 */
export function categoryToServiceType(category) {
  if (!category || category === 'all') {
    return null;
  }
  return CATEGORY_TO_SERVICE_TYPE[category] || null;
}

/**
 * Converts backend service_type to frontend category
 * @param {string} serviceType - Backend service_type
 * @returns {string} - Frontend category slug
 */
export function serviceTypeToCategory(serviceType) {
  if (!serviceType) {
    return 'others';
  }
  return SERVICE_TYPE_TO_CATEGORY[serviceType] || 'others';
}

/**
 * Gets category metadata
 * @param {string} category - Category slug
 * @returns {Object} - Category metadata
 */
export function getCategoryMetadata(category) {
  return CATEGORY_METADATA[category] || CATEGORY_METADATA['others'];
}

/**
 * Validates if a category is valid
 * @param {string} category - Category to validate
 * @returns {boolean}
 */
export function isValidCategory(category) {
  return Object.keys(CATEGORY_METADATA).includes(category) || category === 'all';
}

/**
 * Gets all category slugs
 * @returns {string[]}
 */
export function getAllCategories() {
  return Object.keys(CATEGORY_METADATA);
}

/**
 * Gets navigation items for category selector
 * @returns {Array<{key: string, icon: string, label: string}>}
 */
export function getCategoryNavItems() {
  return getAllCategories().map(key => ({
    key,
    ...getCategoryMetadata(key)
  }));
}

