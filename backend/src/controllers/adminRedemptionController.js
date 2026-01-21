/**
 * Admin Redemption Controller
 * Admin-only endpoints for settlement management, disputes, and overrides
 */

const settlementService = require('../services/settlementService');
const voucherAuditService = require('../services/voucherAuditService');
const voucherStateMachine = require('../services/voucherStateMachine');
const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Update settlement status
 * PUT /api/v1/admin/redemptions/:redemptionId/settlement
 */
async function updateSettlementStatus(req, res) {
  try {
    const { redemptionId } = req.params;
    const { status, reason_code, reason_text } = req.body;
    const adminId = req.userId;

    if (!adminId) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    // Validate reason is provided
    if (!reason_code || !reason_text) {
      return errorResponse(res, 400, 'Reason code and reason text are required for settlement updates');
    }

    const updated = await settlementService.updateSettlementStatus({
      redemptionId,
      newStatus: status,
      adminId,
      reasonCode: reason_code,
      reasonText: reason_text
    });

    successResponse(res, 200, 'Settlement status updated successfully', updated);
  } catch (error) {
    logError('❌ Update settlement status error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to update settlement status');
  }
}

/**
 * Freeze/unfreeze settlement
 * POST /api/v1/admin/redemptions/:redemptionId/freeze
 */
async function freezeSettlement(req, res) {
  try {
    const { redemptionId } = req.params;
    const { freeze, reason_code, reason_text } = req.body;
    const adminId = req.userId;

    if (!adminId) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    if (!reason_code || !reason_text) {
      return errorResponse(res, 400, 'Reason code and reason text are required');
    }

    const result = await settlementService.freezeSettlement({
      redemptionId,
      freeze: freeze === true,
      adminId,
      reasonCode: reason_code,
      reasonText: reason_text
    });

    successResponse(res, 200, `Settlement ${freeze ? 'frozen' : 'unfrozen'} successfully`, result);
  } catch (error) {
    logError('❌ Freeze settlement error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to freeze/unfreeze settlement');
  }
}

/**
 * Raise dispute
 * POST /api/v1/admin/redemptions/:redemptionId/dispute
 */
async function raiseDispute(req, res) {
  try {
    const { redemptionId } = req.params;
    const { dispute_reason } = req.body;
    const adminId = req.userId;

    if (!adminId) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    if (!dispute_reason) {
      return errorResponse(res, 400, 'Dispute reason is required');
    }

    const result = await settlementService.raiseDispute({
      redemptionId,
      adminId,
      disputeReason: dispute_reason
    });

    successResponse(res, 200, 'Dispute raised successfully', result);
  } catch (error) {
    logError('❌ Raise dispute error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to raise dispute');
  }
}

/**
 * Get voucher audit trail
 * GET /api/v1/admin/vouchers/:voucherCode/audit
 */
async function getVoucherAuditTrail(req, res) {
  try {
    const { voucherCode } = req.params;
    const { limit = 100 } = req.query;

    const auditTrail = await voucherAuditService.getAuditTrail(voucherCode, parseInt(limit));

    successResponse(res, 200, 'Audit trail retrieved successfully', {
      voucher_code: voucherCode,
      audit_logs: auditTrail,
      count: auditTrail.length
    });
  } catch (error) {
    logError('❌ Get voucher audit trail error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get audit trail');
  }
}

/**
 * Get booking audit trail
 * GET /api/v1/admin/bookings/:bookingId/audit
 */
async function getBookingAuditTrail(req, res) {
  try {
    const { bookingId } = req.params;
    const { limit = 100 } = req.query;

    const auditTrail = await voucherAuditService.getBookingAuditTrail(bookingId, parseInt(limit));

    successResponse(res, 200, 'Audit trail retrieved successfully', {
      booking_id: bookingId,
      audit_logs: auditTrail,
      count: auditTrail.length
    });
  } catch (error) {
    logError('❌ Get booking audit trail error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get audit trail');
  }
}

/**
 * Get state transition history
 * GET /api/v1/admin/bookings/:bookingId/state-history
 */
async function getStateHistory(req, res) {
  try {
    const { bookingId } = req.params;
    const { limit = 50 } = req.query;

    const history = await voucherStateMachine.getStateHistory(bookingId, parseInt(limit));

    successResponse(res, 200, 'State history retrieved successfully', {
      booking_id: bookingId,
      transitions: history,
      count: history.length
    });
  } catch (error) {
    logError('❌ Get state history error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get state history');
  }
}

/**
 * Get admin overrides
 * GET /api/v1/admin/redemptions/:redemptionId/overrides
 */
async function getAdminOverrides(req, res) {
  try {
    const { redemptionId } = req.params;

    const result = await pool.query(
      `SELECT * FROM admin_overrides
       WHERE redemption_id = $1
       ORDER BY created_at DESC`,
      [redemptionId]
    );

    successResponse(res, 200, 'Admin overrides retrieved successfully', {
      redemption_id: redemptionId,
      overrides: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logError('❌ Get admin overrides error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get admin overrides');
  }
}

/**
 * List redemptions with settlement filters
 * GET /api/v1/admin/redemptions
 */
async function listRedemptions(req, res) {
  try {
    const { 
      settlement_status, 
      is_frozen, 
      partner_id, 
      start_date, 
      end_date,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        ra.*,
        b.booking_reference,
        b.user_id,
        b.partner_id,
        po.title as deal_title,
        p.name as partner_name,
        u.first_name || ' ' || u.last_name as user_name
      FROM redemption_audit ra
      JOIN bookings b ON ra.booking_id = b.id
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN partners p ON b.partner_id = p.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (settlement_status) {
      query += ` AND ra.settlement_status = $${paramCount}`;
      params.push(settlement_status);
      paramCount++;
    }

    if (is_frozen !== undefined) {
      query += ` AND ra.is_frozen = $${paramCount}`;
      params.push(is_frozen === 'true');
      paramCount++;
    }

    if (partner_id) {
      query += ` AND b.partner_id = $${paramCount}`;
      params.push(partner_id);
      paramCount++;
    }

    if (start_date) {
      query += ` AND ra.redeemed_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND ra.redeemed_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` ORDER BY ra.redeemed_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    successResponse(res, 200, 'Redemptions retrieved successfully', {
      redemptions: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logError('❌ List redemptions error:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to list redemptions');
  }
}

module.exports = {
  updateSettlementStatus,
  freezeSettlement,
  raiseDispute,
  getVoucherAuditTrail,
  getBookingAuditTrail,
  getStateHistory,
  getAdminOverrides,
  listRedemptions
};

