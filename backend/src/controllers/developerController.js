const crypto = require('crypto');
const developerApiKeyRepository = require('../repositories/developerApiKeyRepository');
const bookingRepository = require('../repositories/bookingRepository');
const { hashKey } = require('../middleware/authenticateApiKey');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Create API key (user auth required)
async function createKey(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return errorResponse(res, 400, 'Name is required');
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);
    const key = await developerApiKeyRepository.createKey({
      userId,
      name: String(name).trim().slice(0, 255),
      keyHash,
      keyPrefix,
    });
    // Return key only once
    res.status(201).json({
      success: true,
      message: 'API key created. Copy it now; it will not be shown again.',
      data: {
        id: key.id,
        name: key.name,
        key_prefix: key.key_prefix,
        key: rawKey,
        created_at: key.created_at,
      },
    });
  } catch (err) {
    logError('Create API key error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create API key');
  }
}

// List API keys (no secret)
async function listKeys(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const keys = await developerApiKeyRepository.listByUserId(userId);
    successResponse(res, 200, 'API keys retrieved', keys.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      scopes: k.scopes,
      rate_limit_per_min: k.rate_limit_per_min,
      is_active: k.is_active,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })));
  } catch (err) {
    logError('List API keys error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list API keys');
  }
}

// Revoke API key
async function revokeKey(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const keyId = parseInt(req.params.id, 10);
    if (!keyId) return errorResponse(res, 400, 'Invalid key ID');
    const updated = await developerApiKeyRepository.revokeKey(keyId, userId);
    if (!updated) return errorResponse(res, 404, 'Key not found or already revoked');
    successResponse(res, 200, 'API key revoked');
  } catch (err) {
    logError('Revoke API key error', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to revoke API key');
  }
}

// Public API: validate voucher (API key auth)
async function validateVoucher(req, res) {
  try {
    const code = req.query.code || (req.body && req.body.code);
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, error: 'Voucher code (code) is required' });
    }
    const booking = await bookingRepository.getBookingByVoucherCode(String(code).trim());
    if (!booking) {
      return res.status(200).json({
        success: true,
        valid: false,
        error: 'Voucher not found',
      });
    }
    const valid = (booking.voucher_state === 'active' && booking.status !== 'cancelled');
    res.status(200).json({
      success: true,
      valid,
      data: valid ? {
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        partner_id: booking.partner_id,
        partner_name: booking.partner_name,
        status: booking.status,
        voucher_state: booking.voucher_state,
        booking_date: booking.booking_date,
        booking_time: booking.booking_time,
      } : { voucher_state: booking.voucher_state, status: booking.status },
    });
  } catch (err) {
    logError('Validate voucher API error', err);
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
}

module.exports = {
  createKey,
  listKeys,
  revokeKey,
  validateVoucher,
};
