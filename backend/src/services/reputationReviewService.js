/**
 * Reputation & Intelligence: transactional review creation and listing.
 * Rules: logged-in user, redemption status = redeemed, one review per redemption,
 * partner reviews_enabled = true. Moderation pipeline runs on create.
 */
const reputationReviewRepository = require('../repositories/reputationReviewRepository');
const reputationModeration = require('./reputationModeration');
const partnerRepository = require('../repositories/partnerRepository');
const { AppError } = require('../../utils/response');
const { logError } = require('../../utils/logger');

function getClientIp(req) {
  const forwarded = (req && req.headers && req.headers['x-forwarded-for']) ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : '';
  const ip = (req && req.ip) ? String(req.ip).trim() : '';
  return forwarded || ip || '';
}

async function submitReview(partnerId, userId, payload, options = {}) {
  const { clientIp = '' } = options;
  const { rating, title, comment } = payload || {};
  if (!rating || rating < 1 || rating > 5) {
    throw new AppError(400, 'Rating must be between 1 and 5');
  }
  const blocked = await reputationReviewRepository.isUserBlockedForReviews(userId);
  if (blocked) {
    throw new AppError(403, 'You are not allowed to submit reviews. Contact support if this is an error.');
  }
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) throw new AppError(404, 'Venue not found');

  const settings = await reputationReviewRepository.getPartnerSettings(partnerId);
  if (!settings.reviews_enabled) {
    throw new AppError(403, 'Reviews are disabled for this venue');
  }
  const commentText = settings.comments_enabled ? (comment || '').trim() : '';
  const redemptionId = await reputationReviewRepository.findRedemptionForReview(userId, partnerId);
  if (!redemptionId) {
    throw new AppError(400, 'You can review only after a successful redemption at this venue');
  }
  const alreadyReviewed = await reputationReviewRepository.hasReviewForRedemption(redemptionId);
  if (alreadyReviewed) {
    throw new AppError(409, 'You have already submitted a review for this visit');
  }

  let moderation = reputationModeration.runModeration(commentText, rating, {
    autoModerationEnabled: settings.auto_moderation_enabled,
  });

  const layer5 = await reputationModeration.runLayer5AnomalyCheck(partnerId, clientIp, reputationReviewRepository);
  if (layer5.anomaly) {
    moderation = {
      ...moderation,
      moderation_status: 'FLAGGED',
      is_visible: false,
      reason_codes: [...(moderation.reason_codes || []), ...layer5.reason_codes],
    };
  }

  const row = await reputationReviewRepository.createReview({
    redemption_id: redemptionId,
    user_id: userId,
    partner_id: partnerId,
    rating: Number(rating),
    comment: commentText || null,
    sentiment_score: moderation.sentiment_score,
    toxicity_score: moderation.toxicity_score,
    spam_score: moderation.spam_score,
    moderation_status: moderation.moderation_status,
    is_visible: moderation.is_visible,
    ip_address: clientIp || null,
  });

  await reputationReviewRepository.insertAuditLog(row.id, 'CREATED', userId, 'user', {
    rating: row.rating,
    moderation_status: row.moderation_status,
    reason_codes: moderation.reason_codes,
  });
  if (moderation.reason_codes?.length) {
    await reputationReviewRepository.insertAuditLog(row.id, 'AUTO_FLAGGED', null, 'system', {
      reason_codes: moderation.reason_codes,
    });
  }

  try {
    await updatePartnerAnalytics(partnerId);
  } catch (e) {
    logError('Reputation analytics update (non-fatal):', e?.message);
  }

  return mapToLegacyShape(row);
}

function mapToLegacyShape(row) {
  return {
    id: row.id,
    partner_id: row.partner_id,
    user_id: row.user_id,
    booking_id: null,
    rating: row.rating,
    title: null,
    comment: row.comment,
    is_verified_visit: true,
    created_at: row.created_at,
  };
}

async function listByPartner(partnerId, limit = 20, offset = 0) {
  return await reputationReviewRepository.listByPartner(partnerId, limit, offset, true);
}

async function getAggregate(partnerId) {
  return await reputationReviewRepository.getAggregate(partnerId);
}

async function updatePartnerAnalytics(partnerId) {
  const { getPool } = require('../config/db');
  const pool = getPool();
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS review_count,
       ROUND(AVG(rating)::numeric, 2) AS rolling_avg_rating,
       ROUND(AVG(sentiment_score)::numeric, 4) AS sentiment_avg,
       COUNT(*) FILTER (WHERE moderation_status = 'FLAGGED')::float / NULLIF(COUNT(*), 0) AS flag_ratio
     FROM reputation_reviews
     WHERE partner_id = $1 AND deleted_at IS NULL AND is_visible = true`,
    [partnerId]
  );
  const row = r.rows[0];
  if (!row) return;
  const review_count = row.review_count || 0;
  const flag_ratio = review_count > 0 ? parseFloat(row.flag_ratio || 0) : null;
  await reputationReviewRepository.upsertAnalytics(partnerId, {
    rolling_avg_rating: row.rolling_avg_rating ? parseFloat(row.rolling_avg_rating) : null,
    trend_30_day: null,
    sentiment_avg: row.sentiment_avg ? parseFloat(row.sentiment_avg) : null,
    flag_ratio,
    risk_score: null,
    review_count,
  });
}

async function softDeleteReview(reviewId, actorId, actorRole = 'admin') {
  const review = await reputationReviewRepository.getById(reviewId);
  if (!review) return null;
  const updated = await reputationReviewRepository.softDelete(reviewId);
  if (updated) {
    await reputationReviewRepository.insertAuditLog(reviewId, 'SOFT_DELETED', actorId, actorRole, {});
    try {
      await updatePartnerAnalytics(review.partner_id);
    } catch (e) {
      logError('Reputation analytics after soft-delete (non-fatal):', e?.message);
    }
  }
  return updated;
}

async function restoreReview(reviewId, actorId, actorRole = 'admin') {
  const updated = await reputationReviewRepository.restore(reviewId);
  if (updated) {
    await reputationReviewRepository.insertAuditLog(reviewId, 'RESTORED', actorId, actorRole, {});
    try {
      await updatePartnerAnalytics(updated.partner_id);
    } catch (e) {
      logError('Reputation analytics after restore (non-fatal):', e?.message);
    }
  }
  return updated;
}

async function getReviewAuditLog(reviewId, limit = 50) {
  return await reputationReviewRepository.listAuditLog(reviewId, limit);
}

async function markMaliciousReview(reviewId, actorId, actorRole = 'admin') {
  const review = await reputationReviewRepository.getById(reviewId);
  if (!review) return null;
  const updated = await reputationReviewRepository.markReviewMalicious(reviewId, actorId);
  if (updated) {
    await reputationReviewRepository.insertAuditLog(reviewId, 'MARKED_MALICIOUS', actorId, actorRole, {});
  }
  return updated;
}

async function blockUserForReviews(userId, blockedBy, reason) {
  await reputationReviewRepository.blockUserForReviews(userId, blockedBy, reason);
  return true;
}

async function unblockUserForReviews(userId) {
  return await reputationReviewRepository.unblockUserForReviews(userId);
}

async function requestDispute(reviewId, partnerId, reason) {
  const review = await reputationReviewRepository.getById(reviewId);
  if (!review) return null;
  if (review.partner_id !== partnerId) return null;
  const updated = await reputationReviewRepository.setReviewDisputeRequest(reviewId, partnerId, reason);
  if (updated) {
    await reputationReviewRepository.insertAuditLog(reviewId, 'DISPUTE_REQUESTED', partnerId, 'partner', {
      dispute_reason: reason,
    });
  }
  return updated;
}

async function getModerationReasonForPartner(reviewId, partnerId) {
  const review = await reputationReviewRepository.getById(reviewId);
  if (!review || review.partner_id !== partnerId) return null;
  const reason_codes = await reputationReviewRepository.getLastAutoFlaggedReason(reviewId);
  return { review_id: reviewId, reason_codes };
}

module.exports = {
  submitReview,
  getClientIp,
  listByPartner,
  getAggregate,
  updatePartnerAnalytics,
  softDeleteReview,
  restoreReview,
  getReviewAuditLog,
  markMaliciousReview,
  blockUserForReviews,
  unblockUserForReviews,
  requestDispute,
  getModerationReasonForPartner,
};
