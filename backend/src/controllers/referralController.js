const referralService = require('../services/referralService');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * Get or create user's referral code
 */
async function getReferralCode(req, res) {
  try {
    const userId = req.userId;
    const referralCode = await referralService.getOrCreateReferralCode(userId);

    return successResponse(res, { referralCode }, 'Referral code retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get referral statistics
 */
async function getReferralStats(req, res) {
  try {
    const userId = req.userId;
    const stats = await referralService.getUserReferralStats(userId);

    return successResponse(res, stats, 'Referral stats retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get referral history
 */
async function getReferralHistory(req, res) {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const history = await referralService.getReferralHistory(userId, limit, offset);

    return successResponse(res, { history }, 'Referral history retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Get referral leaderboard
 */
async function getLeaderboard(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = await referralService.getLeaderboard(limit);

    return successResponse(res, { leaderboard }, 'Leaderboard retrieved successfully');
  } catch (error) {
    return errorResponse(res, error);
  }
}

/**
 * Validate referral code (public, no auth required)
 */
async function validateReferralCode(req, res) {
  try {
    const { code } = req.params;
    
    // Just check if code exists and is valid
    const pool = require('../config/db').getPool();
    const result = await pool.query(
      `SELECT r.referral_code, r.referee_discount_amount, u.first_name
       FROM referrals r
       INNER JOIN users u ON r.referrer_id = u.id
       WHERE r.referral_code = $1 
       AND r.status = 'pending'
       AND (r.expires_at IS NULL OR r.expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [code]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, new Error('Invalid or expired referral code'), 404);
    }

    const referral = result.rows[0];
    return successResponse(res, {
      valid: true,
      discount: referral.referee_discount_amount,
      referrerName: referral.first_name,
      message: `${referral.first_name} invited you! Get ₹${referral.referee_discount_amount} off your first booking!`
    }, 'Referral code is valid');
  } catch (error) {
    return errorResponse(res, error);
  }
}

module.exports = {
  getReferralCode,
  getReferralStats,
  getReferralHistory,
  getLeaderboard,
  validateReferralCode
};

