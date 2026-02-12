const { successResponse, errorResponse } = require('../../utils/response');
const recommendationService = require('../services/recommendationService');
const { logError } = require('../../utils/logger');

async function getRecommendedOffers(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const offers = await recommendationService.getRecommendedOffers(userId);
    successResponse(res, 200, 'Recommendations retrieved', offers);
  } catch (err) {
    logError('Recommendations error:', err);
    errorResponse(res, 500, err.message || 'Failed to get recommendations');
  }
}

module.exports = {
  getRecommendedOffers,
};
