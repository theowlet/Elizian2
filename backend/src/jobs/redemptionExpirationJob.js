const { getPool } = require('../config/db');
const voucherStateMachine = require('../services/voucherStateMachine');
const visitSessionRepository = require('../repositories/visitSessionRepository');
const { log, logError } = require('../utils/logger');

const pool = getPool();

const DUAL_CONFIRMATION_ENABLED = process.env.DUAL_CONFIRMATION_ENABLED === 'true' || process.env.DUAL_CONFIRMATION_ENABLED === '1';

/**
 * Expire redemptions that are still pending confirmation past confirmation_expires_at.
 * Reverts voucher state to 'active' so the partner can re-initiate.
 * Also expires stale visit sessions (expires_at < NOW()).
 */
async function runRedemptionExpirationJob() {
  if (!DUAL_CONFIRMATION_ENABLED) return;

  try {
    const expired = await pool.query(
      `SELECT id, booking_id, voucher_code
       FROM redemption_audit
       WHERE redemption_status = 'pending_confirmation'
         AND (customer_confirmation_status IS NULL OR customer_confirmation_status = 'pending')
         AND confirmation_expires_at IS NOT NULL
         AND confirmation_expires_at < NOW()`
    );

    for (const row of expired.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE redemption_audit SET
             customer_confirmation_status = 'auto_expired',
             redemption_status = 'auto_expired'
           WHERE id = $1`,
          [row.id]
        );
        await voucherStateMachine.transitionState({
          bookingId: row.booking_id,
          voucherCode: row.voucher_code,
          fromState: 'pending_confirmation',
          toState: 'active',
          actorId: null,
          actorRole: 'system',
          reasonCode: 'auto_expired',
          reasonText: 'Confirmation window expired; voucher reverted to active',
          executor: client,
        });
        await client.query('COMMIT');
        log(`Redemption ${row.id} auto-expired; voucher ${row.voucher_code} reverted to active`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logError(`redemptionExpirationJob: failed for redemption ${row.id}`, err);
      } finally {
        client.release();
      }
    }

    await visitSessionRepository.expireStaleSessionsJob();
  } catch (error) {
    logError('❌ Redemption expiration job error:', error);
  }
}

function startRedemptionExpirationJob() {
  if (process.env.VERCEL) {
    log('⏸️ Redemption expiration job disabled on Vercel');
    return;
  }
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  setInterval(runRedemptionExpirationJob, intervalMs);
  log('✅ Redemption expiration job scheduled every 5 minutes');
  runRedemptionExpirationJob();
}

module.exports = {
  runRedemptionExpirationJob,
  startRedemptionExpirationJob,
};
