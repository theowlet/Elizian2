const cron = require('node-cron');
const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');
const slotCapacityService = require('../services/slotCapacityService');
const waitlistService = require('../services/waitlistService');

const pool = getPool();

// Auto-cancel pending bookings after 10 minutes
function startBookingAutoCancelJob() {
  if (process.env.VERCEL) {
    log('⏸️ Auto-cancel bookings cron disabled on Vercel');
    return;
  }

  cron.schedule('*/5 * * * *', async () => { // Run every 5 minutes
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // FIX #2: Include partner_id, booking_date, booking_time in RETURNING
      // (slot_id was never set by createBooking, so the old release code was dead)
      const result = await pool.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = 'Auto-cancelled: No confirmation within 10 minutes'
         WHERE status = 'pending'
         AND created_at < $1
         RETURNING id, deal_id, partner_id, booking_date, booking_time, num_tickets`,
        [tenMinutesAgo]
      );

      if (result.rows.length > 0) {
        log(`🔄 Auto-cancelled ${result.rows.length} pending bookings`);

        // FIX #2: Release slots using proper service methods instead of broken slot_id approach
        for (const booking of result.rows) {
          const partySize = booking.num_tickets || 1;
          // Release deal_slots capacity
          if (booking.deal_id && booking.booking_date) {
            try {
              await slotCapacityService.releaseDealSlotStandalone(
                booking.deal_id, booking.booking_date, booking.booking_time, partySize
              );
            } catch (e) {
              logError(`⚠️ Failed to release deal slot for auto-cancelled booking ${booking.id}:`, e);
            }
          }
          // Release venue_time_slots capacity
          if (booking.partner_id && booking.booking_date && booking.booking_time) {
            try {
              const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
              if (slotDt) {
                await slotCapacityService.releaseSlotStandalone(booking.partner_id, slotDt, partySize);
              }
            } catch (e) {
              logError(`⚠️ Failed to release venue slot for auto-cancelled booking ${booking.id}:`, e);
            }
          }
          // FIFO: Promote or notify next waitlist user when slot opens
          if (booking.partner_id && booking.booking_date && booking.booking_time) {
            const dateStr = (slotCapacityService.toDateString && slotCapacityService.toDateString(booking.booking_date)) || String(booking.booking_date).trim().substring(0, 10);
            const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
            if (dateStr && timeStr) {
              const promote = booking.deal_id
                ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
                : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
              promote
                .then((result) => {
                  if (result) {
                    if (result.booking) log(`🔔 FIFO waitlist: promoted user ${result.waitlistEntry?.user_id} to confirmed booking for auto-cancelled slot ${dateStr} ${timeStr}`);
                    else log(`🔔 FIFO waitlist: notified user ${result.user_id} for auto-cancelled slot ${dateStr} ${timeStr}`);
                  }
                })
                .catch((err) => logError('⚠️ Waitlist promote/notify failed (non-fatal):', err));
            }
          }
        }
      }
    } catch (error) {
      logError('❌ Error in auto-cancel bookings cron job:', error);
    }
  });

  log('⏰ Auto-cancel pending bookings: Enabled (runs every 5 minutes)');
}

module.exports = {
  startBookingAutoCancelJob
};
