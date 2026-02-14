const membershipCardRepository = require('../repositories/membershipCardRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function getMyCards(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const cards = await membershipCardRepository.getCardsByUserId(userId);
    successResponse(res, 200, 'Membership cards retrieved', cards);
  } catch (err) {
    logError('Membership cards list error', err);
    return successResponse(res, 200, 'Membership cards retrieved', []);
  }
}

module.exports = { getMyCards };
