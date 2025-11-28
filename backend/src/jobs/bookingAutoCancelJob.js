const cron = require('node-cron');
const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');

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
      
      const result = await pool.query(
        `UPDATE bookings 
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = 'Auto-cancelled: No confirmation within 10 minutes'
         WHERE status = 'pending'
         AND created_at < $1
         RETURNING id, deal_id, slot_id, num_tickets`,
        [tenMinutesAgo]
      );

      if (result.rows.length > 0) {
        log(`🔄 Auto-cancelled ${result.rows.length} pending bookings`);
        
        // Release slots for cancelled bookings
        for (const booking of result.rows) {
          if (booking.slot_id) {
            await pool.query(
              `UPDATE deal_slots 
               SET booked = GREATEST(0, booked - $1),
                   is_available = CASE WHEN (capacity - GREATEST(0, booked - $1)) > 0 THEN true ELSE false END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [booking.num_tickets || 1, booking.slot_id]
            );
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

