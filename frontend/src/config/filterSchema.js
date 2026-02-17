/**
 * Dynamic filter schema — universal + category-specific.
 * Drives filter panel UI and API param names. No restaurant bias.
 * Category keys match activeCategory (frontend) / service_type (API).
 */

export const filterSchema = {
  universal: [
    { key: 'rating', type: 'range', label: 'Rating', apiKey: 'min_rating', min: 0, max: 5, step: 0.5 },
    { key: 'price', type: 'range', label: 'Price', apiKeyMin: 'price_min', apiKeyMax: 'price_max' },
    { key: 'distance', type: 'range', label: 'Distance', apiKey: 'max_distance_km', options: [5, 10, 25, 50] },
    { key: 'availability', type: 'boolean', label: 'Open now', apiKey: 'open_now' },
  ],
  dining: [
    { key: 'cuisine', type: 'multi-select', label: 'Cuisine', apiKey: 'cuisine_types', options: ['Indian', 'Italian', 'Chinese', 'Japanese', 'Thai', 'Mexican', 'Continental', 'Cafe', 'North Indian', 'South Indian'] },
    { key: 'mealType', type: 'multi-select', label: 'Meal type', apiKey: 'meal_type', options: ['Breakfast', 'Lunch', 'Dinner', 'Brunch', 'Snacks'] },
  ],
  'spa-and-salon': [
    { key: 'therapyType', type: 'multi-select', label: 'Therapy', apiKey: 'therapy_type', options: ['Deep Tissue', 'Swedish', 'Aromatherapy', 'Reflexology', 'Hot Stone', 'Hair', 'Nails', 'Facial'] },
    { key: 'duration', type: 'range', label: 'Duration (min)', apiKeyMin: 'duration_min', apiKeyMax: 'duration_max' },
  ],
  wellness: [
    { key: 'therapyType', type: 'multi-select', label: 'Therapy', apiKey: 'therapy_type', options: ['Yoga', 'Meditation', 'Deep Tissue', 'Swedish', 'Aromatherapy'] },
    { key: 'duration', type: 'range', label: 'Duration (min)', apiKeyMin: 'duration_min', apiKeyMax: 'duration_max' },
  ],
  events: [
    { key: 'eventType', type: 'multi-select', label: 'Event type', apiKey: 'event_type', options: ['Music', 'Comedy', 'Sports', 'Theatre', 'Workshop', 'Conference'] },
    { key: 'date', type: 'date', label: 'Date', apiKey: 'event_date' },
  ],
  travel: [
    { key: 'starRating', type: 'multi-select', label: 'Star rating', apiKey: 'star_rating', options: ['3', '4', '5'] },
    { key: 'refundable', type: 'boolean', label: 'Refundable', apiKey: 'refundable' },
  ],
  healthcare: [
    { key: 'specialization', type: 'multi-select', label: 'Specialization', apiKey: 'specialization', options: ['General', 'Dental', 'Skin', 'Eye', 'Physiotherapy'] },
  ],
  others: [],
};

/** Frontend category id → API service_type */
export const categoryToServiceType = {
  all: null,
  dining: 'dining',
  events: 'events',
  healthcare: 'healthcare',
  spa: 'spa-and-salon',
  wellness: 'wellness',
  travel: 'travel',
  others: 'others',
};

/** Get category-specific filter config for current category */
export function getFiltersForCategory(activeCategory) {
  const st = categoryToServiceType[activeCategory];
  const universal = filterSchema.universal || [];
  const categoryFilters = (st && filterSchema[st]) ? filterSchema[st] : [];
  return { universal, categoryFilters };
}
