/**
 * Dynamic filter builder — category-aware, SQL-injection safe.
 * Builds additional WHERE conditions for list queries when experience_metadata is used.
 * Caller (offerRepository.listPublicOffers) merges with universal filters and uses
 * LEFT JOIN experience_metadata em ON em.offer_id = po.id when dynamicFilters are present.
 *
 * Backward compatible: all filters optional; missing metadata → offer still included
 * when condition is (em.column IS NULL OR em.column = $n) or array overlap with NULL check.
 */

const CATEGORY_SERVICE_MAP = {
  Dining: 'dining',
  Spa: 'spa-and-salon',
  Events: 'events',
  Travel: 'travel',
  Healthcare: 'healthcare',
  Wellness: 'wellness',
  Others: 'others',
};

/**
 * Build category-specific + metadata filter conditions.
 * Use with LEFT JOIN experience_metadata em ON em.offer_id = po.id.
 * Table alias for metadata: em.
 *
 * @param {Object} filters - query filters
 * @param {string} [filters.service_type] - dining | events | spa-and-salon | wellness | travel | healthcare | others
 * @param {number} [filters.rating] - min rating (applied to p.rating in main repo)
 * @param {number} [filters.priceMin] - already in filterBuilder
 * @param {number} [filters.priceMax] - already in filterBuilder
 * @param {string[]} [filters.cuisine] - dining: overlap with em.cuisine or p.cuisine_types
 * @param {string[]} [filters.mealType] - dining: em.meal_type && array
 * @param {string[]} [filters.therapyType] - spa: em.therapy_type && array
 * @param {number} [filters.durationMin] - spa/wellness: em.duration_minutes >=
 * @param {number} [filters.durationMax] - spa/wellness: em.duration_minutes <=
 * @param {string[]} [filters.eventType] - events: em.event_type && array
 * @param {string} [filters.eventDate] - events: em.event_date = date
 * @param {number} [filters.starRating] - travel: em.star_rating >=
 * @param {boolean} [filters.refundable] - travel: em.refundable = true
 * @param {string[]} [filters.specialization] - healthcare: em.specialization && array
 * @param {number} [paramOffset] - next param index (1-based)
 * @returns {{ conditions: string[], values: any[], paramOffset: number }}
 */
function buildDynamicFilters(filters, paramOffset = 1) {
  const conditions = [];
  const values = [];
  let i = paramOffset;

  if (!filters || typeof filters !== 'object') {
    return { conditions, values, paramOffset: i };
  }

  const serviceType = filters.service_type || null;

  // Dining: cuisine (prefer experience_metadata; fallback is in main repo via p.cuisine_types)
  if (serviceType === 'dining' && filters.cuisine && Array.isArray(filters.cuisine) && filters.cuisine.length > 0) {
    conditions.push(`(em.offer_id IS NULL OR em.cuisine && $${i}::text[])`);
    values.push(filters.cuisine);
    i += 1;
  }
  if (serviceType === 'dining' && filters.mealType && Array.isArray(filters.mealType) && filters.mealType.length > 0) {
    conditions.push(`(em.offer_id IS NULL OR em.meal_type && $${i}::text[])`);
    values.push(filters.mealType);
    i += 1;
  }

  // Spa / Wellness
  if ((serviceType === 'spa-and-salon' || serviceType === 'wellness') && filters.therapyType && Array.isArray(filters.therapyType) && filters.therapyType.length > 0) {
    conditions.push(`(em.offer_id IS NULL OR em.therapy_type && $${i}::text[])`);
    values.push(filters.therapyType);
    i += 1;
  }
  if ((serviceType === 'spa-and-salon' || serviceType === 'wellness') && filters.durationMin != null && Number.isFinite(Number(filters.durationMin))) {
    conditions.push(`(em.offer_id IS NULL OR em.duration_minutes >= $${i})`);
    values.push(Number(filters.durationMin));
    i += 1;
  }
  if ((serviceType === 'spa-and-salon' || serviceType === 'wellness') && filters.durationMax != null && Number.isFinite(Number(filters.durationMax))) {
    conditions.push(`(em.offer_id IS NULL OR em.duration_minutes <= $${i})`);
    values.push(Number(filters.durationMax));
    i += 1;
  }

  // Events
  if (serviceType === 'events' && filters.eventType && Array.isArray(filters.eventType) && filters.eventType.length > 0) {
    conditions.push(`(em.offer_id IS NULL OR em.event_type && $${i}::text[])`);
    values.push(filters.eventType);
    i += 1;
  }
  if (serviceType === 'events' && filters.eventDate) {
    conditions.push(`(em.offer_id IS NULL OR em.event_date = $${i}::date)`);
    values.push(filters.eventDate);
    i += 1;
  }

  // Travel
  if (serviceType === 'travel' && filters.starRating != null && Number.isFinite(Number(filters.starRating))) {
    conditions.push(`(em.offer_id IS NULL OR em.star_rating >= $${i})`);
    values.push(Number(filters.starRating));
    i += 1;
  }
  if (serviceType === 'travel' && filters.refundable === true) {
    conditions.push(`(em.offer_id IS NULL OR em.refundable = true)`);
  }

  // Healthcare
  if (serviceType === 'healthcare' && filters.specialization && Array.isArray(filters.specialization) && filters.specialization.length > 0) {
    conditions.push(`(em.offer_id IS NULL OR em.specialization && $${i}::text[])`);
    values.push(filters.specialization);
    i += 1;
  }

  return { conditions, values, paramOffset: i };
}

/**
 * Whether listPublicOffers should LEFT JOIN experience_metadata (e.g. when dynamic filters are used).
 */
function needsMetadataJoin(filters) {
  if (!filters || typeof filters !== 'object') return false;
  const st = filters.service_type;
  if (filters.cuisine?.length || filters.mealType?.length) return true;
  if ((st === 'spa-and-salon' || st === 'wellness') && (filters.therapyType?.length || filters.durationMin != null || filters.durationMax != null)) return true;
  if (st === 'events' && (filters.eventType?.length || filters.eventDate)) return true;
  if (st === 'travel' && (filters.starRating != null || filters.refundable === true)) return true;
  if (st === 'healthcare' && filters.specialization?.length) return true;
  return false;
}

module.exports = {
  buildDynamicFilters,
  needsMetadataJoin,
  CATEGORY_SERVICE_MAP,
};
