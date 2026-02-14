const { getPool } = require('../config/db');
const tokenService = require('./tokenService');
const voucherStateMachine = require('./voucherStateMachine');
const { AppError } = require('../utils/response');
const { log } = require('../utils/logger');

const pool = getPool();

/**
 * Confirm a pending redemption (consumer). Runs in caller's transaction if executor provided.
 * @param {string} redemptionId - redemption_audit id
 * @param {string} userId - must be booking owner
 * @param {object} executor - pg client (required for atomic confirm; caller must BEGIN/COMMIT)
 */
async function confirmRedemption(redemptionId, userId, executor) {
  if (!executor) throw new AppError(500, 'Transaction client required for confirmRedemption');
  const client = executor;
  const redemptionResult = await client.query(
    `SELECT ra.*, b.user_id AS booking_user_id, b.voucher_code, b.id AS booking_id, b.booking_reference
     FROM redemption_audit ra
     JOIN bookings b ON b.id = ra.booking_id
     WHERE ra.id = $1 FOR UPDATE OF ra`,
    [redemptionId]
  );
  if (redemptionResult.rows.length === 0) {
    throw new AppError(404, 'Redemption not found');
  }
  const r = redemptionResult.rows[0];
  if (r.booking_user_id !== userId) {
    throw new AppError(403, 'Not your redemption');
  }
  if (r.customer_confirmation_status !== 'pending' && r.redemption_status !== 'pending_confirmation') {
    throw new AppError(400, 'Redemption is not pending confirmation');
  }
  const expiresAt = r.confirmation_expires_at ? new Date(r.confirmation_expires_at) : null;
  if (expiresAt && expiresAt < new Date()) {
    throw new AppError(400, 'Confirmation window has expired');
  }
  const eztRequired = parseFloat(r.ezt_tokens_required ?? (r.ezt_co_pay_amount / 100) ?? 0);
  // Only deduct tokens if co-pay amount > 0 (some offers may be 0% co-pay)
  if (eztRequired > 0) {
    await tokenService.redeemTokens(
      r.booking_user_id,
      eztRequired,
      null,
      `Voucher redemption confirmed (Booking ${r.booking_reference || r.booking_id})`,
      client
    );
  }
  await client.query(
    `UPDATE redemption_audit SET
      customer_confirmation_status = 'confirmed',
      customer_confirmed_at = NOW(),
      redemption_status = 'redeemed'
     WHERE id = $1`,
    [redemptionId]
  );
  await voucherStateMachine.transitionState({
    bookingId: r.booking_id,
    voucherCode: r.voucher_code,
    fromState: 'pending_confirmation',
    toState: 'redeemed',
    actorId: userId,
    actorRole: 'user',
    reasonCode: 'customer_confirmed',
    reasonText: 'Customer confirmed redemption',
    executor: client,
  });
  await client.query(
    `UPDATE bookings SET status = 'redeemed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [r.booking_id]
  );
  const updated = await client.query('SELECT * FROM redemption_audit WHERE id = $1', [redemptionId]);
  log(`Redemption ${redemptionId} confirmed by user ${userId}`);
  return updated.rows[0];
}

/**
 * Dispute a pending redemption (consumer).
 * @param {object} executor - pg client (optional; if omitted uses pool for single statements)
 */
async function disputeRedemption(redemptionId, userId, reason, executor) {
  const client = executor || pool;
  const redemptionResult = await client.query(
    `SELECT ra.*, b.user_id AS booking_user_id, b.voucher_code, b.id AS booking_id
     FROM redemption_audit ra
     JOIN bookings b ON b.id = ra.booking_id
     WHERE ra.id = $1 FOR UPDATE OF ra`,
    [redemptionId]
  );
  if (redemptionResult.rows.length === 0) {
    throw new AppError(404, 'Redemption not found');
  }
  const r = redemptionResult.rows[0];
  if (r.booking_user_id !== userId) {
    throw new AppError(403, 'Not your redemption');
  }
  if (r.customer_confirmation_status !== 'pending' && r.redemption_status !== 'pending_confirmation') {
    throw new AppError(400, 'Redemption is not pending confirmation');
  }
  await client.query(
    `UPDATE redemption_audit SET
      customer_confirmation_status = 'disputed',
      customer_dispute_reason = $1,
      redemption_status = 'disputed'
     WHERE id = $2`,
    [reason || 'Disputed by customer', redemptionId]
  );
  await voucherStateMachine.transitionState({
    bookingId: r.booking_id,
    voucherCode: r.voucher_code,
    fromState: 'pending_confirmation',
    toState: 'disputed',
    actorId: userId,
    actorRole: 'user',
    reasonCode: 'customer_dispute',
    reasonText: reason || 'Customer disputed',
    executor: client,
  });
  const updated = await client.query('SELECT * FROM redemption_audit WHERE id = $1', [redemptionId]);
  log(`Redemption ${redemptionId} disputed by user ${userId}`);
  return updated.rows[0];
}

module.exports = {
  confirmRedemption,
  disputeRedemption,
};
