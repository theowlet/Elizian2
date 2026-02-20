/**
 * Campaign Auto-Activation Job
 * Runs every 1 minute: finds campaigns with status = 'scheduled' and start_at <= NOW(),
 * transitions them to status = 'active', logs activation, and emits campaign_started.
 */

const cron = require('node-cron');
const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');
const triggerProcessor = require('../campaign/triggerProcessor');
const { emitRealtimeEvent } = require('../utils/realtimeEmitter');

const pool = getPool();

function startCampaignActivationJob() {
  if (process.env.VERCEL) {
    log('⏸️ Campaign activation cron disabled on Vercel');
    return;
  }

  cron.schedule('* * * * *', async () => {
    try {
      const tableCheck = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns')"
      );
      if (!tableCheck.rows[0]?.exists) return;

      const hasStartAt = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'start_at')"
      );
      const startCol = hasStartAt.rows[0]?.exists ? 'start_at' : 'start_date';
      const now = new Date().toISOString();

      const result = await pool.query(
        `UPDATE campaigns
         SET status = 'active'
         WHERE status = 'scheduled'
           AND (${startCol}::timestamptz <= $1::timestamptz)
         RETURNING id, name, ${startCol} AS started_at`,
        [now]
      );

      const activated = result.rows || [];
      for (const row of activated) {
        log(`✅ Campaign auto-activated: ${row.name} (id: ${row.id})`);
        emitRealtimeEvent('campaign_started', { campaignId: row.id, name: row.name, started_at: row.started_at });
      }
      if (activated.length > 0) {
        triggerProcessor.invalidateActiveCampaignsCache();
      }
    } catch (error) {
      logError('❌ Campaign activation job error:', error);
    }
  });

  log('⏰ Campaign activation job: Enabled (runs every 1 minute)');
}

module.exports = {
  startCampaignActivationJob
};
