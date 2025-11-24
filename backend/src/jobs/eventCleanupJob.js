const cron = require('node-cron');
const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');

const pool = getPool();

// Archive expired items (offers and events)
async function archiveExpiredItems() {
  try {
    log('🔄 Starting automated archiving process...');
    
    // Get archive threshold from settings
    const settingsResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'archive_expired_after_days'"
    );
    const archiveAfterDays = parseInt(settingsResult.rows[0]?.setting_value || 7);
    const archiveThreshold = new Date();
    archiveThreshold.setDate(archiveThreshold.getDate() - archiveAfterDays);

    // Archive expired offers
    const expiredOffers = await pool.query(
      `SELECT id FROM partner_offers 
       WHERE end_date < $1 
       AND is_active = true
       AND id NOT IN (SELECT offer_id FROM archives WHERE offer_id IS NOT NULL)`,
      [archiveThreshold]
    );

    for (const offer of expiredOffers.rows) {
      await pool.query(
        `INSERT INTO archives (offer_id, archived_on, reason, can_reactivate)
         VALUES ($1, CURRENT_TIMESTAMP, 'Automatically archived after expiry', true)`,
        [offer.id]
      );
      await pool.query(
        'UPDATE partner_offers SET is_active = false WHERE id = $1',
        [offer.id]
      );
    }

    // Archive expired events
    const expiredEvents = await pool.query(
      `SELECT id FROM events 
       WHERE (start_time < $1 OR end_time < $1)
       AND status = 'active'
       AND id NOT IN (SELECT event_id FROM archives WHERE event_id IS NOT NULL)`,
      [archiveThreshold]
    );

    for (const event of expiredEvents.rows) {
      await pool.query(
        `INSERT INTO archives (event_id, archived_on, reason, can_reactivate)
         VALUES ($1, CURRENT_TIMESTAMP, 'Automatically archived after event date', true)`,
        [event.id]
      );
      await pool.query(
        "UPDATE events SET status = 'completed' WHERE id = $1",
        [event.id]
      );
    }

    log(`✅ Archived ${expiredOffers.rows.length} offers and ${expiredEvents.rows.length} events`);
  } catch (err) {
    logError('❌ Archiving error:', err);
  }
}

function startEventCleanupJob() {
  if (process.env.VERCEL) {
    log('⏸️ Automated archiving cron disabled on Vercel');
    return;
  }

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_ARCHIVING === 'true') {
    cron.schedule('0 2 * * *', archiveExpiredItems);
    log('📅 Automated archiving scheduled (daily at 2 AM)');
  }
}

module.exports = {
  startEventCleanupJob,
  archiveExpiredItems
};

