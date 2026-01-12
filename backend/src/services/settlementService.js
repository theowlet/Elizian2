/**
 * Settlement Service
 * Manages settlement lifecycle: PENDING → INVOICED → SETTLED → DISPUTED
 */

const { getPool } = require('../config/db');
const voucherStateMachine = require('./voucherStateMachine');
const voucherAuditService = require('./voucherAuditService');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Valid settlement transitions
const SETTLEMENT_TRANSITIONS = {
  'pending': ['invoiced', 'frozen'],
  'invoiced': ['settled', 'disputed', 'frozen'],
  'settled': ['closed'],
  'disputed': ['settled', 'frozen'],
  'frozen': ['pending', 'invoiced', 'settled'],
  'closed': [] // Terminal
};

/**
 * Update settlement status
 * @param {Object} params - Settlement parameters
 * @param {string} params.redemptionId - Redemption ID
 * @param {string} params.newStatus - New settlement status
 * @param {string} params.adminId - Admin ID performing the update
 * @param {string} params.reasonCode - Reason code (mandatory for admin actions)
 * @param {string} params.reasonText - Reason text
 * @param {Object} executor - Database client (optional)
 * @returns {Object} Updated redemption record
 */
async function updateSettlementStatus({
  redemptionId,
  newStatus,
  adminId,
  reasonCode,
  reasonText,
  executor = pool
}) {
  const client = executor === pool ? await pool.connect() : executor;
  const shouldRelease = executor === pool;

  try {
    // Validate status transition
    const currentResult = await client.query(
      `SELECT settlement_status, booking_id, voucher_code, is_frozen
       FROM redemption_audit
       WHERE id = $1
       FOR UPDATE`,
      [redemptionId]
    );

    if (currentResult.rows.length === 0) {
      throw new AppError(404, 'Redemption not found');
    }

    const current = currentResult.rows[0];
    const currentStatus = current.settlement_status || 'pending';

    // Check if frozen
    if (current.is_frozen && newStatus !== 'frozen') {
      throw new AppError(400, 'Cannot update settlement status. Redemption is frozen.');
    }

    // Validate transition
    const allowedStatuses = SETTLEMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedStatuses.includes(newStatus)) {
      throw new AppError(400, `Invalid settlement transition from '${currentStatus}' to '${newStatus}'`);
    }

    // Require reason for admin actions
    if (!reasonCode || !reasonText) {
      throw new AppError(400, 'Reason code and reason text are required for settlement status updates');
    }

    if (shouldRelease) await client.query('BEGIN');

    // Update settlement status
    const updateData = {
      settlement_status: newStatus,
      updated_at: new Date()
    };

    if (newStatus === 'settled') {
      updateData.settled_at = new Date();
      updateData.settled_by = adminId;
    }

    const updateQuery = `
      UPDATE redemption_audit
      SET settlement_status = $1,
          settled_at = $2,
          settled_by = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      newStatus,
      updateData.settled_at || null,
      updateData.settled_by || null,
      redemptionId
    ]);

    const updated = result.rows[0];

    // Log admin override
    await client.query(
      `INSERT INTO admin_overrides (
        redemption_id,
        override_type,
        admin_id,
        reason_code,
        reason_text,
        previous_value,
        new_value
      ) VALUES ($1, 'settlement_override', $2, $3, $4, $5, $6)`,
      [
        redemptionId,
        adminId,
        reasonCode,
        reasonText,
        JSON.stringify({ settlement_status: currentStatus }),
        JSON.stringify({ settlement_status: newStatus })
      ]
    );

    // If settled, transition voucher state: redeemed → settled
    if (newStatus === 'settled') {
      const bookingId = current.booking_id;
      const voucherCode = current.voucher_code;

      try {
        await voucherStateMachine.transitionState({
          bookingId,
          voucherCode,
          fromState: 'redeemed',
          toState: 'settled',
          actorId: adminId,
          actorRole: 'admin',
          reasonCode: 'settlement_completed',
          reasonText: reasonText,
          executor: client
        });
      } catch (stateError) {
        // Log but don't fail settlement
        logError('⚠️ State transition error during settlement (non-blocking):', stateError);
      }
    }

    // Log audit
    await voucherAuditService.logAuditEvent({
      redemptionId: redemptionId,
      bookingId: current.booking_id,
      voucherCode: current.voucher_code,
      action: 'settlement_update',
      actorId: adminId,
      actorRole: 'admin',
      requestData: {
        redemption_id: redemptionId,
        previous_status: currentStatus,
        new_status: newStatus
      },
      responseData: {
        settlement_status: newStatus,
        settled_at: updateData.settled_at
      },
      reasonCode: reasonCode,
      reasonText: reasonText,
      executor: client
    });

    if (shouldRelease) await client.query('COMMIT');

    log(`✅ Settlement status updated: ${currentStatus} → ${newStatus} (Redemption: ${redemptionId})`);

    return updated;
  } catch (error) {
    if (shouldRelease) await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Settlement update error:', error);
    throw new AppError(500, `Settlement update failed: ${error.message}`);
  } finally {
    if (shouldRelease) client.release();
  }
}

/**
 * Freeze/unfreeze settlement
 * @param {Object} params - Freeze parameters
 * @param {string} params.redemptionId - Redemption ID
 * @param {boolean} params.freeze - True to freeze, false to unfreeze
 * @param {string} params.adminId - Admin ID
 * @param {string} params.reasonCode - Reason code
 * @param {string} params.reasonText - Reason text
 * @returns {Object} Updated redemption record
 */
async function freezeSettlement({
  redemptionId,
  freeze,
  adminId,
  reasonCode,
  reasonText
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, is_frozen, booking_id, voucher_code
       FROM redemption_audit
       WHERE id = $1
       FOR UPDATE`,
      [redemptionId]
    );

    if (current.rows.length === 0) {
      throw new AppError(404, 'Redemption not found');
    }

    const redemption = current.rows[0];

    if (redemption.is_frozen === freeze) {
      throw new AppError(400, `Redemption is already ${freeze ? 'frozen' : 'unfrozen'}`);
    }

    // Update freeze status
    await client.query(
      `UPDATE redemption_audit
       SET is_frozen = $1,
           frozen_by = $2,
           frozen_at = $3,
           frozen_reason = $4
       WHERE id = $5
       RETURNING *`,
      [
        freeze,
        freeze ? adminId : null,
        freeze ? new Date() : null,
        freeze ? reasonText : null,
        redemptionId
      ]
    );

    // Log admin override
    await client.query(
      `INSERT INTO admin_overrides (
        redemption_id,
        override_type,
        admin_id,
        reason_code,
        reason_text,
        previous_value,
        new_value
      ) VALUES ($1, 'freeze_override', $2, $3, $4, $5, $6)`,
      [
        redemptionId,
        adminId,
        reasonCode,
        reasonText,
        JSON.stringify({ is_frozen: !freeze }),
        JSON.stringify({ is_frozen: freeze })
      ]
    );

    // Log audit
    await voucherAuditService.logAuditEvent({
      redemptionId: redemptionId,
      bookingId: redemption.booking_id,
      voucherCode: redemption.voucher_code,
      action: freeze ? 'freeze_applied' : 'freeze_removed',
      actorId: adminId,
      actorRole: 'admin',
      reasonCode: reasonCode,
      reasonText: reasonText,
      executor: client
    });

    await client.query('COMMIT');

    log(`✅ Settlement ${freeze ? 'frozen' : 'unfrozen'} (Redemption: ${redemptionId})`);

    return { success: true, is_frozen: freeze };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Freeze settlement error:', error);
    throw new AppError(500, `Freeze operation failed: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Raise dispute
 * @param {Object} params - Dispute parameters
 * @param {string} params.redemptionId - Redemption ID
 * @param {string} params.adminId - Admin ID
 * @param {string} params.disputeReason - Dispute reason
 * @returns {Object} Updated redemption record
 */
async function raiseDispute({
  redemptionId,
  adminId,
  disputeReason
}) {
  return updateSettlementStatus({
    redemptionId,
    newStatus: 'disputed',
    adminId,
    reasonCode: 'dispute_raised',
    reasonText: disputeReason
  });
}

module.exports = {
  updateSettlementStatus,
  freezeSettlement,
  raiseDispute,
  SETTLEMENT_TRANSITIONS
};

