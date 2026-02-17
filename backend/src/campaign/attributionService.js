/**
 * Enterprise Campaign Engine — Attribution service.
 */

const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');

const pool = getPool();

async function record(campaignId, userId, experienceId, eventType, meta = {}) {
  try {
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_attribution')"
    );
    if (!tableCheck.rows[0]?.exists) return;

    await pool.query(
      `INSERT INTO campaign_attribution (campaign_id, user_id, experience_id, event_type, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [campaignId, userId, experienceId, eventType, JSON.stringify(meta)]
    );
  } catch (err) {
    logError('[CampaignEngine] Attribution record error:', err);
  }
}

async function recordRevenue(campaignId, userId, experienceId, revenue, rewardIssued = 0) {
  try {
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_attribution')"
    );
    if (!tableCheck.rows[0]?.exists) return;

    await pool.query(
      `INSERT INTO campaign_attribution (campaign_id, user_id, experience_id, event_type, revenue_generated, reward_issued)
       VALUES ($1, $2, $3, 'booking_created', $4, $5)`,
      [campaignId, userId, experienceId, revenue || 0, rewardIssued || 0]
    );
  } catch (err) {
    logError('[CampaignEngine] Attribution revenue record error:', err);
  }
}

module.exports = {
  record,
  recordRevenue,
};
