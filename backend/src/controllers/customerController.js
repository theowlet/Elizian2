/**
 * Customer-facing endpoints. User ID from JWT only (never from query/body).
 */
const customerEcosystemService = require('../services/customerEcosystemService');
const { logError } = require('../utils/logger');

function successResponse(res, statusCode, message, data) {
  return res.status(statusCode).json({ success: true, message, ...(data != null && { data }) });
}

function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, error: message });
}

/**
 * GET /api/v1/customer/ecosystem-summary
 * Returns tier, lifetimeSpendFiat, totalVisits, totalEztEarned, currentEztBalance, loyaltyCredits.
 * Auth: JWT required; user id from token only.
 */
async function getEcosystemSummary(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const summary = await customerEcosystemService.getEcosystemSummary(userId);
    return successResponse(res, 200, 'Ecosystem summary', summary);
  } catch (err) {
    logError('Customer ecosystem summary error:', err);
    return errorResponse(res, 500, err.message || 'Failed to load account summary');
  }
}

module.exports = {
  getEcosystemSummary,
};
