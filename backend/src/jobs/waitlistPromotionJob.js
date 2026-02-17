/**
 * Waitlist Promotion Job
 *
 * Runs every 1 minute: finds slots with free capacity (venue_time_slots),
 * notifies the first waiting user per slot (10-minute confirmation window).
 * Safe when venue_time_slots does not exist (no-op).
 */

const cron = require('node-cron');
const waitlistService = require('../services/waitlistService');
const { log, logError } = require('../utils/logger');

function startWaitlistPromotionJob() {
  if (process.env.VERCEL) {
    log('⏸️ Waitlist promotion cron disabled on Vercel');
    return;
  }

  cron.schedule('* * * * *', async () => {
    try {
      const result = await waitlistService.runPromotionCycle();
      if (result.notified > 0) {
        log(`🔔 Waitlist promotion: ${result.notified} notified, ${result.slots_checked} slots checked`);
      }
    } catch (error) {
      logError('❌ Waitlist promotion job error:', error);
    }
  });

  log('⏰ Waitlist promotion job: Enabled (runs every 1 minute)');
}

module.exports = {
  startWaitlistPromotionJob
};
