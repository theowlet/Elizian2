/**
 * Admin Campaign Controller — Enterprise Campaign Orchestrator API.
 * No business logic here; delegates to repository and campaign engine.
 */

const adminCampaignRepository = require('../repositories/adminCampaignRepository');
const { EVENT_TYPES, ACTION_TYPES, VALID_TIERS } = require('../campaign/campaignTypes');
const { invalidateActiveCampaignsCache } = require('../campaign/triggerProcessor');
const actionExecutor = require('../campaign/actionExecutor');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

/** If campaign is active and has a rule "IF campaign_start THEN push_notification", send that notification to recipientUserId (e.g. admin). */
async function fireCampaignStartNotificationIfRule(campaign, recipientUserId) {
  if (!recipientUserId || (campaign.status !== 'active' && !campaign.is_active)) return;
  const rules = campaign.rules || [];
  for (const r of rules) {
    const rule = r.rule_json || r;
    const trigger = rule.trigger || {};
    const event = trigger.event || rule.event;
    const action = rule.action || {};
    const actionType = (action.type || '').replace(/\s+/g, '_');
    if (event === 'campaign_start' && actionType === 'push_notification') {
      try {
        await actionExecutor.executeAction(actionType, action.params || {}, {
          userId: recipientUserId,
          campaignId: campaign.id,
          campaignName: campaign.name || campaign.title,
          campaignDescription: campaign.description || '',
        });
      } catch (err) {
        logError('Admin fireCampaignStartNotification error:', err);
      }
      break;
    }
  }
}

async function getCampaignSchema(req, res) {
  try {
    return successResponse(res, 200, 'Schema retrieved', {
      event_types: EVENT_TYPES,
      action_types: ACTION_TYPES,
      target_tiers: VALID_TIERS,
      target_categories: adminCampaignRepository.TARGET_CATEGORIES || ['Dining', 'Spa', 'Events', 'Travel', 'Healthcare', 'Others'],
      user_segments: adminCampaignRepository.USER_SEGMENTS || ['new', 'dormant', 'high_value', 'low_engagement'],
    });
  } catch (err) {
    logError('Admin getCampaignSchema error:', err);
    return errorResponse(res, 500, err.message || 'Failed to get schema');
  }
}

async function listCampaigns(req, res) {
  try {
    const { search, status, type, limit = 50, offset = 0 } = req.query;
    const result = await adminCampaignRepository.listCampaigns({
      search: search || undefined,
      status: status || undefined,
      type: type || undefined,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      offset: Math.max(0, parseInt(offset, 10) || 0),
    });
    return successResponse(res, 200, 'Campaigns retrieved', {
      campaigns: result.rows,
      total: result.total,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      offset: Math.max(0, parseInt(offset, 10) || 0),
    });
  } catch (err) {
    logError('Admin listCampaigns error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to list campaigns');
  }
}

async function getCampaign(req, res) {
  try {
    const campaign = await adminCampaignRepository.getCampaignById(req.params.id);
    if (!campaign) return errorResponse(res, 404, 'Campaign not found');
    return successResponse(res, 200, 'Campaign retrieved', campaign);
  } catch (err) {
    logError('Admin getCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to get campaign');
  }
}

async function createCampaign(req, res) {
  try {
    const campaign = await adminCampaignRepository.createCampaign(req.body || {}, req.userId);
    invalidateActiveCampaignsCache();
    await fireCampaignStartNotificationIfRule(campaign, req.userId);
    return successResponse(res, 201, 'Campaign created', campaign);
  } catch (err) {
    logError('Admin createCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to create campaign');
  }
}

async function updateCampaign(req, res) {
  try {
    const campaign = await adminCampaignRepository.updateCampaign(req.params.id, req.body || {}, req.userId);
    if (!campaign) return errorResponse(res, 404, 'Campaign not found');
    invalidateActiveCampaignsCache();
    await fireCampaignStartNotificationIfRule(campaign, req.userId);
    return successResponse(res, 200, 'Campaign updated', campaign);
  } catch (err) {
    logError('Admin updateCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to update campaign');
  }
}

async function deleteCampaign(req, res) {
  try {
    const deleted = await adminCampaignRepository.deleteCampaign(req.params.id, req.userId);
    if (!deleted) return errorResponse(res, 404, 'Campaign not found');
    invalidateActiveCampaignsCache();
    return successResponse(res, 200, 'Campaign deleted', { id: req.params.id });
  } catch (err) {
    logError('Admin deleteCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to delete campaign');
  }
}

async function cloneCampaign(req, res) {
  try {
    const campaign = await adminCampaignRepository.cloneCampaign(req.params.id, req.userId);
    if (!campaign) return errorResponse(res, 404, 'Campaign not found');
    invalidateActiveCampaignsCache();
    return successResponse(res, 201, 'Campaign cloned', campaign);
  } catch (err) {
    logError('Admin cloneCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to clone campaign');
  }
}

async function pauseCampaign(req, res) {
  try {
    const campaign = await adminCampaignRepository.setCampaignStatus(req.params.id, 'paused', req.userId);
    if (!campaign) return errorResponse(res, 404, 'Campaign not found');
    invalidateActiveCampaignsCache();
    return successResponse(res, 200, 'Campaign paused', campaign);
  } catch (err) {
    logError('Admin pauseCampaign error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to pause campaign');
  }
}

async function getCampaignAnalytics(req, res) {
  try {
    const campaign = await adminCampaignRepository.getCampaignById(req.params.id);
    if (!campaign) return errorResponse(res, 404, 'Campaign not found');
    const analytics = await adminCampaignRepository.getCampaignAnalytics(req.params.id);
    return successResponse(res, 200, 'Analytics retrieved', { campaign: { id: campaign.id, name: campaign.name }, ...analytics });
  } catch (err) {
    logError('Admin getCampaignAnalytics error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to get analytics');
  }
}

module.exports = {
  listCampaigns,
  getCampaignSchema,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  cloneCampaign,
  pauseCampaign,
  getCampaignAnalytics,
};
