const { getPool } = require('../config/db');
const tokenService = require('./tokenService');
const voucherStateMachine = require('./voucherStateMachine');
const { AppError } = require('../utils/response');
const { log } = require('../utils/logger');
const { emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');

const pool = getPool();

/**
 * Confirm a pending redemption (consumer). Legacy: only used for old pending_confirmation rows.
 * Partner redeem is now final; new redemptions are already 'redeemed' and do not require confirm.
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
    throw new AppError(400, 'Redemption is not pending confirmation. Partner redemption is already final.');
  }
  const expiresAt = r.confirmation_expires_at ? new Date(r.confirmation_expires_at) : null;
  if (expiresAt && expiresAt < new Date()) {
    throw new AppError(400, 'Confirmation window has expired');
  }
  const eztRequired = parseFloat(r.ezt_tokens_required ?? (r.ezt_co_pay_amount / 100) ?? 0);
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
  emitToRoom(`users:${userId}`, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason: 'redemption_confirmed' });
  return updated.rows[0];
}

/**
 * Dispute a redemption (consumer). Allowed only for status 'redeemed' and within dispute window.
 * Partner redeem is final; customer may dispute only within dispute_window_expires_at (e.g. 24h).
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
  // Allow dispute for: (1) legacy pending_confirmation, or (2) redeemed within dispute window
  const isPendingLegacy = r.redemption_status === 'pending_confirmation' && (r.customer_confirmation_status === 'pending' || !r.customer_confirmation_status);
  const isRedeemedInWindow = r.redemption_status === 'redeemed' && (
    (r.dispute_window_expires_at && new Date(r.dispute_window_expires_at) > new Date()) ||
    (!r.dispute_window_expires_at && r.redeemed_at && (Date.now() - new Date(r.redeemed_at).getTime() < 24 * 60 * 60 * 1000))
  );
  if (!isPendingLegacy && !isRedeemedInWindow) {
    if (r.redemption_status === 'redeemed') {
      throw new AppError(400, 'Dispute window has closed. You can only dispute a redemption within the allowed time after the visit.');
    }
    throw new AppError(400, 'Redemption cannot be disputed');
  }
  const fromState = r.redemption_status === 'pending_confirmation' ? 'pending_confirmation' : 'redeemed';
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
    fromState,
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
