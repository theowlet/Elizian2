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
      redemption_notes,
      redemption_latitude,
      redemption_longitude
    } = req.body;

    // STABILIZATION FIX: Only allow partner accounts to redeem vouchers
    // Previously used req.userId as fallback which could allow consumer users
    // to attempt redemption — an authorization boundary violation.
    const partnerId = req.partnerId;

    if (!partnerId) {
      return errorResponse(res, 403, 'Partner authentication required. Only partner accounts can redeem vouchers.');
    }

    // STABILIZATION FIX: Validate financial inputs are finite positive numbers
    // parseFloat("NaN") returns NaN, parseFloat("Infinity") returns Infinity —
    // both pass the >= 0 check in the service layer. Guard here at the boundary.
    const parsedBill = parseFloat(total_bill_amount);
    const parsedEzt = parseFloat(ezt_co_pay_amount);
    const parsedNet = parseFloat(net_amount_from_user);

    if (!Number.isFinite(parsedBill) || parsedBill < 0) {
      return errorResponse(res, 400, 'Invalid total bill amount. Must be a finite number >= 0.');
    }
    if (!Number.isFinite(parsedEzt) || parsedEzt < 0) {
      return errorResponse(res, 400, 'Invalid EZT co-pay amount. Must be a finite number >= 0.');
    }
    if (!Number.isFinite(parsedNet) || parsedNet < 0) {
      return errorResponse(res, 400, 'Invalid net amount from user. Must be a finite number >= 0.');
    }

    // Use enhanced redemption service with enterprise features
    const redemption = await enhancedRedemptionService.redeemVoucherEnhanced({
      voucher_code,
      partner_id: partnerId,
      total_bill_amount: parsedBill,
      ezt_co_pay_amount: parsedEzt,
      net_amount_from_user: parsedNet,
      redeemed_by_user_id: req.userId || null,
      redemption_notes,
      redemption_latitude: redemption_latitude != null ? parseFloat(redemption_latitude) : null,
      redemption_longitude: redemption_longitude != null ? parseFloat(redemption_longitude) : null
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

    // STABILIZATION FIX: Authorization check — only booking owner, partner, or admin
    // can view redemption details (which include financial data).
    // Without this, any authenticated user could query any voucher code.
    const isOwner = redemption.user_id === req.userId;
    const isPartner = redemption.partner_id === req.partnerId;
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';

    if (!isOwner && !isPartner && !isAdmin) {
      return errorResponse(res, 403, 'Not authorized to view this redemption');
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

    // STABILIZATION FIX: Authorization check — verify the requester owns
    // this booking, is the partner, or is an admin before returning audit data.
    const { getPool } = require('../config/db');
    const bookingCheck = await getPool().query(
      'SELECT user_id, partner_id FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingCheck.rows.length === 0) {
      return errorResponse(res, 404, 'Booking not found');
    }

    const booking = bookingCheck.rows[0];
    const isOwner = booking.user_id === req.userId;
    const isPartner = booking.partner_id === req.partnerId;
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';

    if (!isOwner && !isPartner && !isAdmin) {
      return errorResponse(res, 403, 'Not authorized to view this audit trail');
    }

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

