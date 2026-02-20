/**
 * Enterprise Campaign Engine — Core service.
 * Orchestrates rule evaluation, action execution, attribution.
 * Backward compatible: fallback when no campaigns or engine fails.
 */

const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');
const triggerProcessor = require('./triggerProcessor');
const actionExecutor = require('./actionExecutor');
const attributionService = require('./attributionService');
const offerRepository = require('../repositories/offerRepository');
const { VALID_TIERS } = require('./campaignTypes');

const pool = getPool();

let cache = { campaigns: null, cachedAt: 0 };
const CACHE_TTL_MS = 60000;

/**
 * Process event (booking_created, reward_issued, etc.).
 * Non-blocking; does not throw.
 */
async function processEvent(eventType, context = {}) {
  try {
    return await triggerProcessor.processEvent(eventType, context);
  } catch (err) {
    logError('[CampaignEngine] processEvent failed:', err);
    return { processed: 0, campaigns: 0, error: err.message };
  }
}

/**
 * Get reward modifier for user (from active campaigns).
 * Returns 1.0 if no campaign applies (backward compatible).
 */
async function getRewardModifier(userId, userTier, context = {}) {
  try {
    return actionExecutor.getRewardModifier(userId, { ...context, userTier }) || 1.0;
  } catch (err) {
    return 1.0;
  }
}

/**
 * Get active campaigns with experiences for homepage.
 * Deduplicates experiences across campaigns. Tier-filtered.
 */
async function getActiveCampaignsWithExperiences(userTier = null) {
  try {
    const campaigns = await triggerProcessor.getActiveCampaigns();
    if (campaigns.length === 0) return [];

    if (userTier && !VALID_TIERS.includes(userTier)) {
      return campaigns.filter((c) => {
        const tiers = c.target_tiers || [];
        return !tiers.length;
      });
    }

    const seenIds = new Set();
    const result = [];

    for (const c of campaigns) {
      const tiers = c.target_tiers || [];
      if (tiers.length > 0 && userTier && !tiers.includes(userTier)) continue;

      const expIds = await getCampaignExperienceIds(c.id);
      const uniqueIds = expIds.filter((id) => !seenIds.has(id));
      uniqueIds.forEach((id) => seenIds.add(id));

      let offers = [];
      if (uniqueIds.length > 0) {
        try {
          offers = await offerRepository.getPublicOffersByIds(uniqueIds);
        } catch (_) {}
      }

      result.push({
        id: c.id,
        name: c.name,
        description: c.description,
        banner_image_url: c.banner_image_url,
        campaign_type: c.campaign_type,
        priority_weight: c.priority_weight || 0,
        offers,
      });
    }

    result.sort((a, b) => (b.priority_weight || 0) - (a.priority_weight || 0));
    return result;
  } catch (err) {
    logError('[CampaignEngine] getActiveCampaignsWithExperiences error:', err);
    return [];
  }
}

async function getCampaignExperienceIds(campaignId) {
  try {
    const expTable = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_experiences')"
    );
    const mappingTable = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_experience_mapping')"
    );

    if (expTable.rows[0]?.exists) {
      const r = await pool.query('SELECT experience_id FROM campaign_experiences WHERE campaign_id = $1', [
        campaignId,
      ]);
      return r.rows.map((row) => row.experience_id);
    }
    if (mappingTable.rows[0]?.exists) {
      const r = await pool.query('SELECT offer_id FROM campaign_experience_mapping WHERE campaign_id = $1', [
        campaignId,
      ]);
      return r.rows.map((row) => row.offer_id);
    }
    return [];
  } catch (err) {
    return [];
  }
}

/**
 * Record attribution for booking (revenue, reward).
 */
async function recordBookingAttribution(campaignId, userId, experienceId, revenue, rewardIssued) {
  try {
    await attributionService.recordRevenue(campaignId, userId, experienceId, revenue, rewardIssued);
  } catch (err) {
    logError('[CampaignEngine] recordBookingAttribution error:', err);
  }
}

module.exports = {
  processEvent,
  getRewardModifier,
  getActiveCampaignsWithExperiences,
  recordBookingAttribution,
};
