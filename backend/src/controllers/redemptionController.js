const redemptionService = require('../services/redemptionService');
const enhancedRedemptionService = require('../services/enhancedRedemptionService');
const redemptionCalculationService = require('../services/redemptionCalculationService');
const redemptionConfirmationService = require('../services/redemptionConfirmationService');
const bookingRepository = require('../repositories/bookingRepository');
const { getPool } = require('../config/db');
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
    const code = error.statusCode || 500;
    const message = error.message || 'An error occurred while processing the redemption.';
    errorResponse(res, code, message);
  }
}

/**
 * Calculate redemption preview (partner only)
 * GET /api/v1/redemptions/calculate?voucher_code=X&total_bill_amount=Y
 */
async function calculateRedemptionPreview(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 403, 'Partner authentication required');
    }
    const voucherCode = req.query.voucher_code;
    const totalBillAmount = req.query.total_bill_amount;
    if (!voucherCode || totalBillAmount === undefined || totalBillAmount === null) {
      return errorResponse(res, 400, 'voucher_code and total_bill_amount are required');
    }
    const booking = await bookingRepository.getBookingByVoucherCode(String(voucherCode).trim());
    if (!booking) {
      return errorResponse(res, 404, 'Voucher not found');
    }
    if (booking.partner_id !== partnerId) {
      return errorResponse(res, 403, 'Voucher is not for your venue');
    }
    const breakdown = await redemptionCalculationService.calculateRedemptionBreakdown(
      booking.deal_id,
      parseFloat(totalBillAmount) || 0,
      booking.user_id,
      { booking }
    );
    const customerEzt = breakdown.user_ezt_balance != null ? parseFloat(breakdown.user_ezt_balance) : null;
    const standardCoPayInr = breakdown.standard_co_pay_amount != null ? parseFloat(breakdown.standard_co_pay_amount) : (breakdown.ezt_co_pay_amount != null ? parseFloat(breakdown.ezt_co_pay_amount) : 0);
    const maxAllowedCoPay = breakdown.max_allowed_co_pay != null ? parseFloat(breakdown.max_allowed_co_pay) : standardCoPayInr;
    successResponse(res, 200, 'Calculation preview', {
      total_bill_amount: parseFloat(totalBillAmount) || 0,
      ...breakdown,
      standard_co_pay: standardCoPayInr,
      customer_available_ezt: customerEzt,
      effective_max_ezt_co_pay_inr: maxAllowedCoPay,
      max_allowed_co_pay: maxAllowedCoPay,
    });
  } catch (error) {
    logError('❌ Calculate preview error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to calculate');
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

/**
 * Confirm a pending redemption (consumer only)
 * POST /api/v1/redemptions/:redemptionId/confirm
 */
async function confirmRedemption(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const { redemptionId } = req.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const redemption = await redemptionConfirmationService.confirmRedemption(redemptionId, userId, client);
      await client.query('COMMIT');
      successResponse(res, 200, 'Redemption confirmed successfully', redemption);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    logError('❌ Confirm redemption error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to confirm redemption');
  }
}

/**
 * Dispute a pending redemption (consumer only)
 * POST /api/v1/redemptions/:redemptionId/dispute
 */
async function disputeRedemption(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const { redemptionId } = req.params;
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const redemption = await redemptionConfirmationService.disputeRedemption(redemptionId, userId, reason || 'Disputed by customer', client);
      await client.query('COMMIT');
      successResponse(res, 200, 'Redemption disputed', redemption);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    logError('❌ Dispute redemption error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to dispute redemption');
  }
}

/**
 * Get pending confirmations for the current user (consumer)
 * GET /api/v1/redemptions/pending
 * GET /api/v1/redemptions/pending?booking_id=123  — pending for this booking only (so "Confirm your redemption" shows reliably)
 */
async function getPendingConfirmations(req, res) {
  try {
    const userId = req.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const bookingId = req.query.booking_id != null ? parseInt(req.query.booking_id, 10) : null;
    const pool = getPool();
    const params = bookingId != null && !Number.isNaN(bookingId) ? [userId, bookingId] : [userId];
    const bookingFilter = bookingId != null && !Number.isNaN(bookingId) ? ' AND ra.booking_id = $2' : '';
    let result;
    try {
      result = await pool.query(
        `SELECT ra.id AS redemption_id, ra.booking_id, ra.voucher_code, ra.total_bill_amount,
                ra.ezt_co_pay_amount, ra.net_amount_from_user, ra.offer_discount_percentage,
                ra.discount_amount, ra.ezt_tokens_required, ra.customer_confirmation_status,
                ra.confirmation_expires_at, ra.redeemed_at,
                ra.metadata,
                (ra.metadata->>'co_pay_override')::boolean AS co_pay_override,
                (ra.metadata->>'standard_co_pay')::numeric AS standard_co_pay_inr,
                (ra.metadata->>'customer_wallet_at_redemption')::numeric AS customer_wallet_ezt_at_redemption,
                (ra.metadata->>'customer_wallet_inr_at_redemption')::numeric AS customer_wallet_inr_at_redemption,
                ra.metadata->>'override_reason' AS override_reason,
                b.booking_reference, b.deal_id
         FROM redemption_audit ra
         JOIN bookings b ON b.id = ra.booking_id
         WHERE b.user_id = $1
           AND ra.redemption_status = 'pending_confirmation'
           AND (ra.customer_confirmation_status IS NULL OR ra.customer_confirmation_status = 'pending')
           AND (ra.confirmation_expires_at IS NULL OR ra.confirmation_expires_at > NOW())
           ${bookingFilter}
         ORDER BY ra.confirmation_expires_at ASC`,
        params
      );
    } catch (queryErr) {
      if (queryErr.code === '42703' || /column .* does not exist/i.test(queryErr.message || '')) {
        result = await pool.query(
          `SELECT ra.id AS redemption_id, ra.booking_id, ra.voucher_code, ra.total_bill_amount,
                  ra.ezt_co_pay_amount, ra.net_amount_from_user, ra.redeemed_at, ra.metadata,
                  (ra.metadata->>'co_pay_override')::boolean AS co_pay_override,
                  (ra.metadata->>'standard_co_pay')::numeric AS standard_co_pay_inr,
                  ra.metadata->>'override_reason' AS override_reason,
                  b.booking_reference, b.deal_id
           FROM redemption_audit ra
           JOIN bookings b ON b.id = ra.booking_id
           WHERE b.user_id = $1 AND ra.redemption_status = 'pending_confirmation'
           ${bookingFilter}
           ORDER BY ra.redeemed_at ASC`,
          params
        );
      } else {
        throw queryErr;
      }
    }
    successResponse(res, 200, 'Pending confirmations', { pending: result.rows });
  } catch (error) {
    logError('❌ Get pending confirmations error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get pending confirmations');
  }
}

module.exports = {
  redeemVoucher,
  calculateRedemptionPreview,
  getRedemptionByVoucherCode,
  getRedemptionAuditTrail,
  confirmRedemption,
  disputeRedemption,
  getPendingConfirmations,
};

