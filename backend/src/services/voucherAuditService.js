/**
 * Voucher Audit Service
 * Immutable, append-only audit logging for compliance and fraud detection
 */

const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Log audit event (append-only, immutable)
 * @param {Object} params - Audit parameters
 * @param {string} params.bookingId - Booking ID
 * @param {string} params.voucherCode - Voucher code
 * @param {string} params.redemptionId - Redemption ID (optional)
 * @param {string} params.action - Action type
 * @param {string} params.actorId - Actor ID
 * @param {string} params.actorRole - Actor role
 * @param {Object} params.requestData - Request data snapshot
 * @param {Object} params.responseData - Response data snapshot
 * @param {Object} params.errorData - Error data snapshot
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 * @param {string} params.reasonCode - Reason code
 * @param {string} params.reasonText - Reason text
 * @param {Object} executor - Database client (optional)
 * @returns {string} Audit log ID
 */
async function logAuditEvent({
  bookingId = null,
  voucherCode = null,
  redemptionId = null,
  action,
  actorId = null,
  actorRole = 'system',
  requestData = null,
  responseData = null,
  errorData = null,
  ipAddress = null,
  userAgent = null,
  reasonCode = null,
  reasonText = null,
  executor = pool
}) {
  try {
    const result = await executor.query(
      `SELECT log_voucher_audit(
        $1::UUID, $2::UUID, $3::UUID, $4::VARCHAR,
        $5::UUID, $6::VARCHAR, $7::JSONB, $8::JSONB, $9::JSONB,
        $10::INET, $11::TEXT, $12::VARCHAR, $13::TEXT
      ) AS audit_id`,
      [
        bookingId,
        voucherCode,
        redemptionId,
        action,
        actorId,
        actorRole,
        requestData ? JSON.stringify(requestData) : null,
        responseData ? JSON.stringify(responseData) : null,
        errorData ? JSON.stringify(errorData) : null,
        ipAddress,
        userAgent,
        reasonCode,
        reasonText
      ]
    );

    const auditId = result.rows[0].audit_id;
    log(`📝 Audit logged: ${action} (ID: ${auditId})`);

    return auditId;
  } catch (error) {
    // Audit logging should never fail the main operation
    logError('⚠️ Audit logging error (non-blocking):', error);
    return null;
  }
}

/**
 * Get audit trail for a voucher
 * @param {string} voucherCode - Voucher code
 * @param {number} limit - Limit results
 * @returns {Array} Audit trail
 */
async function getAuditTrail(voucherCode, limit = 100) {
  try {
    const result = await pool.query(
      `SELECT * FROM voucher_audit_log
       WHERE voucher_code = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [voucherCode, limit]
    );

    return result.rows;
  } catch (error) {
    logError('❌ Get audit trail error:', error);
    throw new Error(`Failed to get audit trail: ${error.message}`);
  }
}

/**
 * Get audit trail for a booking
 * @param {string} bookingId - Booking ID
 * @param {number} limit - Limit results
 * @returns {Array} Audit trail
 */
async function getBookingAuditTrail(bookingId, limit = 100) {
  try {
    const result = await pool.query(
      `SELECT * FROM voucher_audit_log
       WHERE booking_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [bookingId, limit]
    );

    return result.rows;
  } catch (error) {
    logError('❌ Get booking audit trail error:', error);
    throw new Error(`Failed to get booking audit trail: ${error.message}`);
  }
}

/**
 * Get audit trail for a redemption
 * @param {string} redemptionId - Redemption ID
 * @returns {Array} Audit trail
 */
async function getRedemptionAuditTrail(redemptionId) {
  try {
    const result = await pool.query(
      `SELECT * FROM voucher_audit_log
       WHERE redemption_id = $1
       ORDER BY created_at DESC`,
      [redemptionId]
    );

    return result.rows;
  } catch (error) {
    logError('❌ Get redemption audit trail error:', error);
    throw new Error(`Failed to get redemption audit trail: ${error.message}`);
  }
}

module.exports = {
  logAuditEvent,
  getAuditTrail,
  getBookingAuditTrail,
  getRedemptionAuditTrail
};

