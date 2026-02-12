const recommendationRepository = require('../repositories/recommendationRepository');
const offerService = require('./offerService');

const RECOMMENDATION_LIMIT = 20;

/**
 * Get offers recommended for the user based on past bookings/redemptions (venues they've visited).
 * Falls back to trending offers if no history.
 */
async function getRecommendedOffers(userId) {
  const partnerIds = await recommendationRepository.getUserPartnerPreferences(userId, 30);
  if (partnerIds && partnerIds.length > 0) {
    const offers = await offerService.listPublicOffers({
      partner_ids: partnerIds,
      limit: RECOMMENDATION_LIMIT,
    });
    if (offers && offers.length > 0) return offers;
  }
  return offerService.listPublicOffers({
    trending: true,
    limit: RECOMMENDATION_LIMIT,
  });
}

module.exports = {
  getRecommendedOffers,
};
