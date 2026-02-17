'use strict';
const { logError } = require('../../utils/logger');
const { isTierValid } = require('./campaignTypes');

function evaluateRule(ruleJson, context) {
  if (!ruleJson || typeof ruleJson !== 'object') return null;
  const { trigger, action } = ruleJson;
  if (!trigger || !action) return null;
  if (trigger.event && context.event !== trigger.event) return null;
  if (trigger.conditions && Array.isArray(trigger.conditions)) {
    for (const cond of trigger.conditions) {
      if (!evaluateCondition(cond, context)) return null;
    }
  }
  return { action, context };
}

function evaluateCondition(cond, context) {
  if (!cond || !cond.field) return true;
  const val = getNested(context, cond.field);
  const op = cond.operator || 'eq';
  const target = cond.value;
  switch (op) {
    case 'eq': return val == target;
    case 'neq': return val != target;
    case 'gt': return Number(val) > Number(target);
    case 'gte': return Number(val) >= Number(target);
    case 'lt': return Number(val) < Number(target);
    case 'lte': return Number(val) <= Number(target);
    case 'in': return Array.isArray(target) && target.includes(val);
    case 'contains': return Array.isArray(val) && val.includes(target);
    default: return true;
  }
}

function getNested(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
}

function matchesTargeting(campaign, context) {
  const targets = campaign.targets || campaign;
  const userTier = context.userTier || context.user_tier;
  if (userTier && !isTierValid(userTier)) return false;
  const tiers = targets.target_tiers || campaign.target_tiers || [];
  if (Array.isArray(tiers) && tiers.length > 0 && userTier && !tiers.includes(userTier)) return false;
  const categories = targets.target_categories || campaign.target_categories || [];
  if (Array.isArray(categories) && categories.length > 0) {
    const userCategory = context.userCategory || context.service_type;
    if (userCategory && !categories.includes(userCategory)) return false;
  }
  return true;
}

module.exports = { evaluateRule, evaluateCondition, matchesTargeting };
