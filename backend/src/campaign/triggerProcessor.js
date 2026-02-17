'use strict';
const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');
const ruleEvaluator = require('./ruleEvaluator');
const actionExecutor = require('./actionExecutor');

const pool = getPool();
const activeCampaignsCache = { data: null, cachedAt: 0 };
const CACHE_TTL_MS = 30000; // 30s — avoid N+1 and heavy rules on every event

async function processEvent(eventType, context) {
  try {
    const campaigns = await getActiveCampaigns();
    let processed = 0;
    for (const campaign of campaigns) {
      if (!ruleEvaluator.matchesTargeting(campaign, context)) continue;
      const rules = await getCampaignRules(campaign.id);
      for (const rule of rules) {
        const ruleJson = rule.rule_json;
        const evalContext = { ...context, event: eventType };
        const result = ruleEvaluator.evaluateRule(ruleJson, evalContext);
        if (!result) continue;
        const actionResult = await actionExecutor.executeAction(
          result.action.type,
          result.action.params,
          { ...context, campaignId: campaign.id, campaignName: campaign.name || campaign.title, campaignDescription: campaign.description || '' }
        );
        if (actionResult) processed++;
      }
    }
    return { processed, campaigns: campaigns.length };
  } catch (err) {
    logError('[CampaignEngine] processEvent error:', err);
    return { processed: 0, campaigns: 0, error: err.message };
  }
}

async function getActiveCampaigns() {
  const cacheNow = Date.now();
  if (activeCampaignsCache.data && cacheNow - activeCampaignsCache.cachedAt < CACHE_TTL_MS) {
    return activeCampaignsCache.data;
  }
  try {
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns')"
    );
    if (!tableCheck.rows[0]?.exists) return [];
    const hasTargets = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_targets')"
    );
    const hasAttribution = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_attribution')"
    );
    const nowIso = new Date().toISOString();
    const baseWhere = `(c.status = 'active' OR (c.status IS NULL AND c.is_active = true)) AND (c.start_at <= $1 OR c.start_date <= $1) AND (c.end_at >= $1 OR c.end_date >= $1)`;
    const budgetFilter = hasAttribution.rows[0]?.exists
      ? ` AND (c.budget_limit IS NULL OR (SELECT COALESCE(SUM(reward_issued), 0) FROM campaign_attribution WHERE campaign_id = c.id) < c.budget_limit)`
      : '';
    const sql = hasTargets.rows[0]?.exists
      ? `SELECT c.*, ct.target_tiers, ct.target_categories FROM campaigns c LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id WHERE ${baseWhere}${budgetFilter}`
      : `SELECT c.*, c.target_tiers, c.target_categories FROM campaigns c WHERE ${baseWhere}${budgetFilter}`;
    const result = await pool.query(sql, [nowIso]);
    activeCampaignsCache.data = result.rows;
    activeCampaignsCache.cachedAt = Date.now();
    return result.rows;
  } catch (err) {
    logError('[CampaignEngine] getActiveCampaigns error:', err);
    return [];
  }
}

async function getCampaignRules(campaignId) {
  try {
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_rules')"
    );
    if (!tableCheck.rows[0]?.exists) return [];
    const result = await pool.query('SELECT * FROM campaign_rules WHERE campaign_id = $1', [campaignId]);
    return result.rows;
  } catch (err) {
    logError('[CampaignEngine] getCampaignRules error:', err);
    return [];
  }
}

function invalidateActiveCampaignsCache() {
  activeCampaignsCache.data = null;
  activeCampaignsCache.cachedAt = 0;
}

module.exports = { processEvent, getActiveCampaigns, getCampaignRules, invalidateActiveCampaignsCache };
