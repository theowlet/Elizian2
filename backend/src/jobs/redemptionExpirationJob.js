const visitSessionRepository = require('../repositories/visitSessionRepository');
const { log, logError } = require('../utils/logger');

/**
 * Legacy: previously expired redemptions stuck in pending_confirmation (reverted voucher to active).
 * Partner redeem is now final; new redemptions are created as 'redeemed' with a dispute window only.
 * This job no longer reverts redemptions. It only expires stale visit sessions.
 */
async function runRedemptionExpirationJob() {
  // No longer auto-expire pending_confirmation or revert voucher to active

  try {
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
