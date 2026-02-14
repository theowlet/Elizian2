const recommendationRepository = require('../repositories/recommendationRepository');
const offerService = require('./offerService');
const { getPool } = require('../config/db');

const RECOMMENDATION_LIMIT = 20;

/**
 * Get offers recommended for the user based on:
 * 1. Past bookings/redemptions (venues they've visited)
 * 2. User preferences (cuisine, occasion, time, price)
 * 3. Service type affinity (what categories they engage with most)
 * 4. Time-of-day relevance
 * Falls back to trending offers if no history.
 */
async function getRecommendedOffers(userId) {
  const pool = getPool();

  // --- 1. History-based (existing logic) ---
  const partnerIds = await recommendationRepository.getUserPartnerPreferences(userId, 30);

  // --- 2. User preference-based matching ---
  let preferenceFilters = {};
  try {
    const prefResult = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    if (prefResult.rows.length > 0) {
      const prefs = prefResult.rows[0];
      if (prefs.cuisine_preferences && prefs.cuisine_preferences.length > 0) {
        preferenceFilters.cuisine_types = prefs.cuisine_preferences;
      }
      if (prefs.price_range) {
        preferenceFilters.price_range = prefs.price_range;
      }
    }
  } catch (_) {
    // user_preferences table may not exist yet — graceful fallback
  }

  // --- 3. Service type affinity ---
  let serviceTypeAffinity = null;
  try {
    const affinityResult = await pool.query(
      `SELECT po.service_type, COUNT(*) as cnt
       FROM bookings b
       JOIN partner_offers po ON b.offer_id = po.id
       WHERE b.user_id = $1 AND b.status IN ('confirmed', 'redeemed')
       GROUP BY po.service_type
       ORDER BY cnt DESC
       LIMIT 3`,
      [userId]
    );
    if (affinityResult.rows.length > 0) {
      serviceTypeAffinity = affinityResult.rows.map(r => r.service_type);
    }
  } catch (_) {}

  // --- 4. Time-of-day relevance ---
  const hour = new Date().getHours();
  let timeRelevance = null;
  if (hour >= 6 && hour < 11) timeRelevance = 'morning';
  else if (hour >= 11 && hour < 15) timeRelevance = 'afternoon';
  else if (hour >= 15 && hour < 20) timeRelevance = 'evening';
  else timeRelevance = 'night';

  // --- Combine signals ---
  const recommendedOffers = [];

  // Priority 1: Offers from previously visited partners (familiar venues)
  if (partnerIds && partnerIds.length > 0) {
    const familiar = await offerService.listPublicOffers({
      partner_ids: partnerIds,
      limit: Math.ceil(RECOMMENDATION_LIMIT / 2),
    });
    if (familiar && familiar.length > 0) {
      recommendedOffers.push(...familiar);
    }
  }

  // Priority 2: Offers matching service type affinity
  if (serviceTypeAffinity && recommendedOffers.length < RECOMMENDATION_LIMIT) {
    const existingIds = new Set(recommendedOffers.map(o => o.id));
    for (const sType of serviceTypeAffinity) {
      if (recommendedOffers.length >= RECOMMENDATION_LIMIT) break;
      const affinityOffers = await offerService.listPublicOffers({
        service_type: sType,
        limit: 5,
      });
      if (affinityOffers) {
        for (const o of affinityOffers) {
          if (!existingIds.has(o.id) && recommendedOffers.length < RECOMMENDATION_LIMIT) {
            recommendedOffers.push(o);
            existingIds.add(o.id);
          }
        }
      }
    }
  }

  // Priority 3: Trending fallback
  if (recommendedOffers.length < RECOMMENDATION_LIMIT) {
    const existingIds = new Set(recommendedOffers.map(o => o.id));
    const trending = await offerService.listPublicOffers({
      trending: true,
      limit: RECOMMENDATION_LIMIT,
    });
    if (trending) {
      for (const o of trending) {
        if (!existingIds.has(o.id) && recommendedOffers.length < RECOMMENDATION_LIMIT) {
          recommendedOffers.push(o);
          existingIds.add(o.id);
        }
      }
    }
  }

  return recommendedOffers.slice(0, RECOMMENDATION_LIMIT);
}

/**
 * Update user preferences
 */
async function updateUserPreferences(userId, preferences) {
  const pool = getPool();
  const {
    cuisine_preferences,
    preferred_occasions,
    preferred_time_of_day,
    price_range,
    dietary_restrictions,
  } = preferences;

  await pool.query(
    `INSERT INTO user_preferences (user_id, cuisine_preferences, preferred_occasions, preferred_time_of_day, price_range, dietary_restrictions, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       cuisine_preferences = COALESCE($2, user_preferences.cuisine_preferences),
       preferred_occasions = COALESCE($3, user_preferences.preferred_occasions),
       preferred_time_of_day = COALESCE($4, user_preferences.preferred_time_of_day),
       price_range = COALESCE($5, user_preferences.price_range),
       dietary_restrictions = COALESCE($6, user_preferences.dietary_restrictions),
       updated_at = NOW()`,
    [
      userId,
      cuisine_preferences || null,
      preferred_occasions || null,
      preferred_time_of_day || null,
      price_range || null,
      dietary_restrictions || null,
    ]
  );
}

module.exports = {
  getRecommendedOffers,
  updateUserPreferences,
};
