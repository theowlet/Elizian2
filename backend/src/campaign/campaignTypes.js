/**
 * Enterprise Campaign Engine — Type definitions.
 * Tier compliant: Ather, Nova, Luminar, Valiant, Echelon only.
 */

const VALID_TIERS = ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon'];

const EVENT_TYPES = [
  'booking_created',
  'checkin_verified',
  'reward_issued',
  'waitlist_joined',
  'user_inactive',
  'partner_low_performance',
  'campaign_start',
  'midnight_cron',
];

const ACTION_TYPES = [
  'reward_multiplier',
  'visibility_boost',
  'tier_override',
  'cross_category_mission',
  'geo_boost',
  'echelon_exclusive',
  'waitlist_priority',
  'push_notification',
  'badge_unlock',
];

const CAMPAIGN_STATUS = ['draft', 'scheduled', 'active', 'paused', 'expired'];

function isTierValid(tier) {
  return tier && VALID_TIERS.includes(tier);
}

function validateTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((t) => isTierValid(t));
}

module.exports = {
  VALID_TIERS,
  EVENT_TYPES,
  ACTION_TYPES,
  CAMPAIGN_STATUS,
  isTierValid,
  validateTiers,
};
