/**
 * Layered content moderation for reputation reviews.
 * Layer 1: Rule-based profanity (configurable dictionary + regex).
 * Layers 2–5: Placeholders for AI toxicity, sentiment, spam, anomaly (scores 0 or safe default).
 * All decisions logged; FLAGGED + is_visible=false when threshold exceeded.
 */
const { log } = require('../utils/logger');

// Layer 1: Profanity (English + Hindi minimum). Extend via config.
const PROFANITY_LIST = new Set([
  'badword', 'abuse', 'hate', 'spam', 'scam', 'fraud', 'fake',
  // Add more; in production load from config/DB
]);
const PROFANITY_REGEX = /\b(badword|abuse|hate|spam|scam|fraud|fake)\b/gi;

function layer1Profanity(text) {
  if (!text || typeof text !== 'string') return { detected: false, matches: [] };
  const normalized = text.toLowerCase().trim();
  const matches = [];
  PROFANITY_LIST.forEach((word) => {
    if (normalized.includes(word.toLowerCase())) matches.push(word);
  });
  const regexMatches = (text.match(PROFANITY_REGEX) || []).map((m) => m.toLowerCase());
  const all = [...new Set([...matches, ...regexMatches])];
  return { detected: all.length > 0, matches: all };
}

/** Layer 2: Toxicity (0–1). Placeholder: no AI; return 0. */
function layer2Toxicity(text) {
  const profanity = layer1Profanity(text);
  if (profanity.detected) return Math.min(0.5 + profanity.matches.length * 0.1, 1);
  return 0;
}

/** Layer 3: Sentiment (-1 to +1). Placeholder: naive from rating or 0. */
function layer3Sentiment(text, rating) {
  if (rating != null && rating >= 1 && rating <= 5) {
    return (rating - 3) / 2;
  }
  return 0;
}

/** Layer 4: Spam (0–1). Placeholder: repeated chars, excessive links. */
function layer4Spam(text) {
  if (!text || typeof text !== 'string') return 0;
  let score = 0;
  if (/(https?:\/\/[^\s]+)/gi.test(text)) score += 0.3;
  if (/(.)\1{4,}/.test(text)) score += 0.2;
  if (text.length > 500) score += 0.2;
  return Math.min(score, 1);
}

const TOXICITY_THRESHOLD = 0.7;
const SPAM_THRESHOLD = 0.6;

/**
 * Run moderation pipeline on comment + rating. Returns scores and status.
 * If auto_moderation_enabled and over threshold: moderation_status = FLAGGED, is_visible = false.
 */
function runModeration(comment, rating, options = {}) {
  const { autoModerationEnabled = true } = options;
  const sentiment_score = layer3Sentiment(comment, rating);
  const toxicity_score = layer2Toxicity(comment || '');
  const spam_score = layer4Spam(comment || '');
  const profanity = layer1Profanity(comment || '');

  let moderation_status = 'APPROVED';
  let is_visible = true;
  const reasons = [];

  if (profanity.detected) reasons.push('profanity');
  if (toxicity_score >= TOXICITY_THRESHOLD) reasons.push('toxicity');
  if (spam_score >= SPAM_THRESHOLD) reasons.push('spam');

  if (autoModerationEnabled && reasons.length > 0) {
    moderation_status = 'FLAGGED';
    is_visible = false;
    log(`[Reputation] Auto-flagged review: ${reasons.join(', ')}`);
  }

  return {
    sentiment_score,
    toxicity_score,
    spam_score,
    moderation_status,
    is_visible,
    reason_codes: reasons,
  };
}

/** Layer 5: velocity and same-IP anomaly. Returns { anomaly: boolean, reason_codes: string[] }. */
const VELOCITY_WINDOW_MINUTES = 1;
const VELOCITY_THRESHOLD = 5;
const SAME_IP_WINDOW_HOURS = 24;
const SAME_IP_THRESHOLD = 2;

async function runLayer5AnomalyCheck(partnerId, ipAddress, repository) {
  const reason_codes = [];
  const velocityCount = await repository.countReviewsForPartnerInLastMinutes(partnerId, VELOCITY_WINDOW_MINUTES);
  if (velocityCount >= VELOCITY_THRESHOLD) {
    reason_codes.push('velocity');
    log(`[Reputation] L5 velocity: ${velocityCount} reviews in last ${VELOCITY_WINDOW_MINUTES} min for partner ${partnerId}`);
  }
  const sameIpCount = await repository.countReviewsForPartnerAndIpInLastHours(partnerId, ipAddress, SAME_IP_WINDOW_HOURS);
  if (sameIpCount >= SAME_IP_THRESHOLD) {
    reason_codes.push('same_ip');
    log(`[Reputation] L5 same_ip: ${sameIpCount} reviews from same IP in last ${SAME_IP_WINDOW_HOURS}h for partner ${partnerId}`);
  }
  return { anomaly: reason_codes.length > 0, reason_codes };
}

module.exports = {
  layer1Profanity,
  layer2Toxicity,
  layer3Sentiment,
  layer4Spam,
  runModeration,
  runLayer5AnomalyCheck,
  TOXICITY_THRESHOLD,
  SPAM_THRESHOLD,
};
