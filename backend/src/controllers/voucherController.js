const voucherService = require('../services/voucherService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getPool } = require('../config/db');

const pool = getPool();

// Create voucher for a booking
async function createVoucher(req, res) {
  try {
    const { bookingId } = req.params;
    const userId = req.userId;

    const voucher = await voucherService.createVoucherForBooking(bookingId, userId);
    successResponse(res, 201, "Voucher generated successfully", voucher);
  } catch (err) {
    logError("❌ Voucher generation error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to generate voucher");
  }
}

// Redeem voucher
async function redeemVoucher(req, res) {
  try {
    const { code } = req.params;
    
    // Get partner ID - should be set by authenticateToken middleware
    // Partner tokens have partnerId, user tokens have userId
    const partnerId = req.partnerId || req.userId;
    
    if (!partnerId) {
      return errorResponse(res, 401, "Authentication required");
    }
    
    // Verify user is actually a partner
    const partnerCheck = await pool.query(
      'SELECT id, name, is_active FROM partners WHERE id = $1',
      [partnerId]
    );
    
    if (partnerCheck.rowCount === 0) {
      return errorResponse(res, 403, "Only active partners can redeem vouchers");
    }
    
    if (!partnerCheck.rows[0].is_active) {
      return errorResponse(res, 403, `Partner "${partnerCheck.rows[0].name}" is not active`);
    }

    const result = await voucherService.redeemVoucher(code, partnerId);
    successResponse(res, 200, "Voucher redeemed successfully", result);
  } catch (err) {
    logError("❌ Voucher redemption error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to redeem voucher");
  }
}

// Get voucher by code
async function getVoucher(req, res) {
  try {
    const { code } = req.params;
    const voucher = await voucherService.getVoucherByCode(code);
    successResponse(res, 200, "Voucher retrieved successfully", voucher);
  } catch (err) {
    logError("❌ Voucher fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch voucher");
  }
}

// List partner vouchers
async function listPartnerVouchers(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const vouchers = await voucherService.listVouchersByPartner(id, { status });
    successResponse(res, 200, "Vouchers retrieved successfully", vouchers);
  } catch (err) {
    logError("❌ Vouchers fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch vouchers");
  }
}

module.exports = {
  createVoucher,
  redeemVoucher,
  getVoucher,
  listPartnerVouchers
};

