/**
 * Universal Filter Builder — multi-vertical, SQL-injection safe.
 * Builds WHERE conditions and values for list queries (offers, partners, etc.).
 * Use parameterized placeholders ($1, $2, ...); caller appends to existing params/paramIndex if needed.
 *
 * Backward compatible: all filters optional. Missing filter → no condition added.
 * Used by: offerRepository (reference pattern); new list endpoints can use this directly.
 */

/**
 * Build offer-list filter conditions (universal + optional vertical hints).
 * Returns { conditions: string[], values: any[], paramOffset: number } so caller can merge with existing params.
 *
 * @param {Object} filters
 * @param {string} [filters.service_type] - dining | events | spa-and-salon | wellness | travel | healthcare | others
 * @param {boolean} [filters.trending]
 * @param {number} [filters.price_min]
 * @param {number} [filters.price_max]
 * @param {number} [filters.min_rating]
 * @param {string[]} [filters.cuisine_types] - dining: partner.cuisine_types && array
 * @param {number} [filters.user_latitude]
 * @param {number} [filters.user_longitude]
 * @param {number} [filters.max_distance_km]
 * @param {number} paramOffset - starting param index (1-based)
 */
function buildOfferListFilters(filters, paramOffset = 1) {
  const conditions = [];
  const values = [];
  let i = paramOffset;

  if (!filters || typeof filters !== 'object') {
    return { conditions, values, paramOffset: i };
  }

  if (filters.service_type && typeof filters.service_type === 'string') {
    conditions.push(`po.service_type = $${i}`);
    values.push(filters.service_type);
    i += 1;
  }

  if (filters.trending === true || filters.trending === false) {
    conditions.push(`po.is_trending = $${i}`);
    values.push(filters.trending);
    i += 1;
  }

  if (filters.price_min != null && Number.isFinite(Number(filters.price_min))) {
    conditions.push(
      `(po.discounted_price >= $${i} OR (po.discounted_price IS NULL AND po.original_price >= $${i}))`
    );
    values.push(Number(filters.price_min));
    i += 1;
  }

  if (filters.price_max != null && Number.isFinite(Number(filters.price_max))) {
    conditions.push(
      `(po.discounted_price <= $${i} OR (po.discounted_price IS NULL AND po.original_price <= $${i}))`
    );
    values.push(Number(filters.price_max));
    i += 1;
  }

  if (filters.min_rating != null && Number.isFinite(Number(filters.min_rating))) {
    conditions.push(`p.rating >= $${i}`);
    values.push(Number(filters.min_rating));
    i += 1;
  }

  if (
    filters.cuisine_types &&
    Array.isArray(filters.cuisine_types) &&
    filters.cuisine_types.length > 0
  ) {
    conditions.push(`p.cuisine_types && $${i}::text[]`);
    values.push(filters.cuisine_types);
    i += 1;
  }

  const hasGeo =
    filters.user_latitude != null &&
    filters.user_longitude != null &&
    Number.isFinite(Number(filters.user_latitude)) &&
    Number.isFinite(Number(filters.user_longitude));
  const maxKm =
    filters.max_distance_km != null &&
    Number.isFinite(Number(filters.max_distance_km)) &&
    Number(filters.max_distance_km) > 0;

  if (hasGeo && maxKm) {
    conditions.push(`
      (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians($${i})) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($${i + 1})) +
        sin(radians($${i})) * sin(radians(p.latitude))
      )))) <= $${i + 2}
    `);
    values.push(
      Number(filters.user_latitude),
      Number(filters.user_longitude),
      Number(filters.max_distance_km)
    );
    i += 3;
  }

  return { conditions, values, paramOffset: i };
}

/**
 * Build ORDER BY clause for offer list (distance vs trending).
 * @param {Object} options
 * @param {boolean} options.hasUserLocation
 * @returns {string}
 */
function buildOfferListOrderBy({ hasUserLocation }) {
  if (hasUserLocation) {
    return 'ORDER BY distance_km ASC NULLS LAST, CASE WHEN po.is_trending = true THEN 1 ELSE 0 END DESC, po.created_at DESC';
  }
  return 'ORDER BY CASE WHEN po.is_trending = true THEN 1 ELSE 0 END DESC, po.created_at DESC';
}

module.exports = {
  buildOfferListFilters,
  buildOfferListOrderBy,
};
