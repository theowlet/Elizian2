'use strict';
const { logError } = require('../../utils/logger');
const attributionService = require('./attributionService');

const ACTIONS = {};

ACTIONS.reward_multiplier = async (params, context) => {
  const multiplier = (params && params.multiplier) != null ? Number(params.multiplier) : 1;
  return { type: 'reward_multiplier', multiplier: Math.max(0.1, Math.min(5, multiplier)) };
};

ACTIONS.visibility_boost = async (params, context) => {
  const weight = (params && params.weight) != null ? Number(params.weight) : 1;
  return { type: 'visibility_boost', weight: Math.max(0, Math.min(100, weight)) };
};

ACTIONS.tier_override = async (params, context) => {
  const tier = params && params.tier;
  const VALID = ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon'];
  if (!tier || !VALID.includes(tier)) return null;
  return { type: 'tier_override', tier };
};

ACTIONS.geo_boost = async (params, context) => {
  const radius_km = (params && params.radius_km) != null ? Number(params.radius_km) : 10;
  const weight = (params && params.weight) != null ? Number(params.weight) : 1;
  return { type: 'geo_boost', radius_km, weight };
};

ACTIONS.echelon_exclusive = async () => ({ type: 'echelon_exclusive' });

ACTIONS.waitlist_priority = async (params, context) => {
  const boost = (params && params.boost) != null ? Number(params.boost) : 1;
  return { type: 'waitlist_priority', boost: Math.max(0, boost) };
};

ACTIONS.push_notification = async (params, context) => {
  const title = (params && params.title) ? String(params.title) : (context.campaignName || 'Campaign update');
  const body = (params && params.body) ? String(params.body) : (context.campaignDescription || '');
  const payload = { type: 'push_notification', title, body };
  const userId = context.userId || context.user_id;
  if (userId) {
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.create({
        userId,
        type: 'campaign',
        title: payload.title,
        message: payload.body,
        actionUrl: params.url || '/notifications',
        priority: 'normal',
        sentViaInApp: true,
        sentViaPush: true,
        metadata: context.campaignId ? { campaignId: context.campaignId } : {},
      });
    } catch (err) {
      logError('[CampaignEngine] push_notification (in-app + push) failed:', err);
    }
  }
  return payload;
};

ACTIONS.badge_unlock = async (params, context) => {
  const badge_id = params && params.badge_id;
  if (!badge_id) return null;
  return { type: 'badge_unlock', badge_id: String(badge_id) };
};

ACTIONS.cross_category_mission = async (params, context) => {
  const categories = params && params.categories;
  return { type: 'cross_category_mission', categories: Array.isArray(categories) ? categories : [] };
};

async function executeAction(actionType, params, context) {
  const fn = ACTIONS[actionType];
  if (!fn) {
    logError('[CampaignEngine] Unknown action: ' + actionType);
    return null;
  }
  try {
    const result = await fn(params, context);
    if (result && context.campaignId && context.userId) {
      await attributionService.record(context.campaignId, context.userId, context.experienceId, 'action_executed', { action_type: actionType, result });
    }
    return result;
  } catch (err) {
    logError('[CampaignEngine] Action error:', err);
    return null;
  }
}

function getRewardModifier(userId, context = {}) {
  const modifier = context.reward_multiplier ?? context.campaign_effects?.reward_multiplier;
  return modifier != null ? Math.max(0.1, Math.min(5, Number(modifier))) : 1.0;
}

function getVisibilityBoost(userId, context = {}) {
  const boost = context.search_boost ?? context.campaign_effects?.search_boost;
  return boost != null ? Math.max(0, Math.min(100, Number(boost))) : 0;
}

module.exports = { executeAction, getRewardModifier, getVisibilityBoost, ACTIONS };
