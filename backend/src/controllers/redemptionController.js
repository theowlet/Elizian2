const redemptionService = require('../services/redemptionService');
const enhancedRedemptionService = require('../services/enhancedRedemptionService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

/**
 * Redeem a voucher (Enhanced with enterprise features)
 * POST /api/v1/redemptions/redeem
 */
async function redeemVoucher(req, res) {
  try {
    const {
      voucher_code,
      total_bill_amount,
      ezt_co_pay_amount,
      net_amount_from_user,
      redemption_notes
    } = req.body;

    // Get partner_id from authenticated user (partner)
    const partnerId = req.partnerId || req.userId; // Support both partner and user auth
    
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }

    // Use enhanced redemption service with enterprise features
    const redemption = await enhancedRedemptionService.redeemVoucherEnhanced({
      voucher_code,
      partner_id: partnerId,
      total_bill_amount: parseFloat(total_bill_amount),
      ezt_co_pay_amount: parseFloat(ezt_co_pay_amount),
      net_amount_from_user: parseFloat(net_amount_from_user),
      redeemed_by_user_id: req.userId || null,
      redemption_notes
    }, {
      actorId: partnerId,
      actorRole: 'partner',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    successResponse(res, 200, 'Voucher redeemed successfully', redemption);
  } catch (error) {
    logError('❌ Redeem voucher error:', error);
    
    // Safe error response (no sensitive data)
    const errorMessage = error.statusCode === 500 
      ? 'An error occurred while processing the redemption. Please try again or contact support.'
      : error.message;
    
    errorResponse(res, error.statusCode || 500, errorMessage);
  }
}

/**
 * Get redemption by voucher code
 * GET /api/v1/redemptions/voucher/:voucher_code
 */
async function getRedemptionByVoucherCode(req, res) {
  try {
    const { voucher_code } = req.params;

    const redemption = await redemptionService.getRedemptionByVoucherCode(voucher_code);

    if (!redemption) {
      return errorResponse(res, 404, 'Redemption not found');
    }

    successResponse(res, 200, 'Redemption retrieved successfully', redemption);
  } catch (error) {
    logError('❌ Get redemption error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get redemption');
  }
}

/**
 * Get redemption audit trail for a booking
 * GET /api/v1/redemptions/booking/:bookingId
 */
async function getRedemptionAuditTrail(req, res) {
  try {
    const { bookingId } = req.params;

    const auditTrail = await redemptionService.getRedemptionAuditTrail(bookingId);

    successResponse(res, 200, 'Redemption audit trail retrieved successfully', {
      booking_id: bookingId,
      redemptions: auditTrail
    });
  } catch (error) {
    logError('❌ Get redemption audit trail error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get redemption audit trail');
  }
}

module.exports = {
  redeemVoucher,
  getRedemptionByVoucherCode,
  getRedemptionAuditTrail
};

