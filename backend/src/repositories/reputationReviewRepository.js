/**
 * Reputation & Intelligence: review persistence.
 * Uses reputation_reviews, review_audit_logs, partner_review_settings, review_analytics.
 * No modification of existing venue_reviews or redemption tables.
 */
const { getPool } = require('../config/db');
const pool = getPool();

const TABLE_REVIEWS = 'reputation_reviews';
const TABLE_AUDIT = 'review_audit_logs';
const TABLE_SETTINGS = 'partner_review_settings';
const TABLE_ANALYTICS = 'review_analytics';
const TABLE_BLOCKED = 'blocked_review_users';

async function getPartnerSettings(partnerId) {
  const r = await pool.query(
    `SELECT reviews_enabled, comments_enabled, auto_moderation_enabled
     FROM ${TABLE_SETTINGS} WHERE partner_id = $1`,
    [partnerId]
  );
  if (r.rows[0]) return r.rows[0];
  return { reviews_enabled: true, comments_enabled: true, auto_moderation_enabled: true };
}

async function findRedemptionForReview(userId, partnerId) {
  const r = await pool.query(
    `SELECT ra.id FROM redemption_audit ra
     INNER JOIN bookings b ON b.id = ra.booking_id
     WHERE b.user_id = $1 AND b.partner_id = $2 AND ra.redemption_status = 'redeemed'
     ORDER BY ra.redeemed_at DESC NULLS LAST
     LIMIT 1`,
    [userId, partnerId]
  );
  return r.rows[0]?.id || null;
}

async function hasReviewForRedemption(redemptionId) {
  const r = await pool.query(
    `SELECT id FROM ${TABLE_REVIEWS} WHERE redemption_id = $1 AND deleted_at IS NULL`,
    [redemptionId]
  );
  return r.rows.length > 0;
}

async function createReview(row) {
  const {
    redemption_id,
    user_id,
    partner_id,
    rating,
    comment,
    sentiment_score,
    toxicity_score,
    spam_score,
    moderation_status,
    is_visible,
    ip_address,
  } = row;
  const base = [
    redemption_id,
    user_id,
    partner_id,
    rating,
    comment || null,
    sentiment_score ?? null,
    toxicity_score ?? null,
    spam_score ?? null,
    moderation_status || 'APPROVED',
    is_visible !== false,
  ];
  const hasIpColumn = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'ip_address'`,
    [TABLE_REVIEWS]
  ).then((r) => r.rows.length > 0);
  if (hasIpColumn) {
    const r = await pool.query(
      `INSERT INTO ${TABLE_REVIEWS} (
        redemption_id, user_id, partner_id, rating, comment,
        sentiment_score, toxicity_score, spam_score, moderation_status, is_visible, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [...base, ip_address || null]
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO ${TABLE_REVIEWS} (
      redemption_id, user_id, partner_id, rating, comment,
      sentiment_score, toxicity_score, spam_score, moderation_status, is_visible
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    base
  );
  return r.rows[0];
}

/** Layer 5: count reviews for partner in last N minutes (velocity) */
async function countReviewsForPartnerInLastMinutes(partnerId, minutes) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${TABLE_REVIEWS}
     WHERE partner_id = $1 AND created_at >= now() - ($2::text || ' minutes')::interval`,
    [partnerId, minutes]
  );
  return r.rows[0]?.n ?? 0;
}

/** Layer 5: count reviews for same partner + IP in last N hours (same-IP anomaly). Returns 0 if ip_address column missing. */
async function countReviewsForPartnerAndIpInLastHours(partnerId, ipAddress, hours) {
  if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.trim()) return 0;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${TABLE_REVIEWS}
       WHERE partner_id = $1 AND ip_address = $2 AND created_at >= now() - ($3::text || ' hours')::interval`,
      [partnerId, ipAddress.trim().substring(0, 45), hours]
    );
    return r.rows[0]?.n ?? 0;
  } catch (e) {
    if (e.message && /column.*ip_address|does not exist/i.test(e.message)) return 0;
    throw e;
  }
}

async function isUserBlockedForReviews(userId) {
  const r = await pool.query(
    `SELECT 1 FROM ${TABLE_BLOCKED} WHERE user_id = $1`,
    [userId]
  );
  return r.rows.length > 0;
}

async function blockUserForReviews(userId, blockedBy, reason) {
  await pool.query(
    `INSERT INTO ${TABLE_BLOCKED} (user_id, blocked_by, reason) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET blocked_at = now(), blocked_by = $2, reason = $3`,
    [userId, blockedBy || null, reason || null]
  );
}

async function unblockUserForReviews(userId) {
  const r = await pool.query(`DELETE FROM ${TABLE_BLOCKED} WHERE user_id = $1 RETURNING user_id`, [userId]);
  return r.rows[0] != null;
}

async function markReviewMalicious(reviewId, actorId) {
  const r = await pool.query(
    `UPDATE ${TABLE_REVIEWS} SET marked_malicious_at = now(), marked_malicious_by = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [reviewId, actorId]
  );
  return r.rows[0] || null;
}

async function setReviewDisputeRequest(reviewId, partnerId, reason) {
  const r = await pool.query(
    `UPDATE ${TABLE_REVIEWS}
     SET dispute_requested_at = now(), dispute_requested_by = $2, dispute_reason = $3, updated_at = now()
     WHERE id = $1 AND partner_id = $2 AND deleted_at IS NULL RETURNING *`,
    [reviewId, partnerId, reason || null]
  );
  return r.rows[0] || null;
}

async function listByPartner(partnerId, limit = 20, offset = 0, visibleOnly = true) {
  let where = `r.partner_id = $1 AND r.deleted_at IS NULL`;
  if (visibleOnly) where += ` AND r.is_visible = true AND r.moderation_status = 'APPROVED'`;
  const r = await pool.query(
    `SELECT r.id, r.partner_id, r.user_id, r.rating, r.comment, r.created_at,
            u.first_name, u.last_name
     FROM ${TABLE_REVIEWS} r
     JOIN users u ON u.id = r.user_id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [partnerId, limit, offset]
  );
  return r.rows.map((row) => ({
    id: row.id,
    partner_id: row.partner_id,
    user_id: row.user_id,
    rating: row.rating,
    title: null,
    comment: row.comment,
    is_verified_visit: true,
    created_at: row.created_at,
    user_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Guest',
  }));
}

async function getAggregate(partnerId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS review_count,
            ROUND(AVG(rating)::numeric, 2) AS average_rating
     FROM ${TABLE_REVIEWS}
     WHERE partner_id = $1 AND deleted_at IS NULL AND is_visible = true AND moderation_status = 'APPROVED'`,
    [partnerId]
  );
  const row = r.rows[0];
  return {
    review_count: row?.review_count || 0,
    average_rating: row?.review_count > 0 ? parseFloat(row.average_rating) : null,
  };
}

async function insertAuditLog(reviewId, actionType, actorId, actorRole, metadata = {}) {
  await pool.query(
    `INSERT INTO ${TABLE_AUDIT} (review_id, action_type, actor_id, actor_role, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [reviewId, actionType, actorId || null, actorRole || null, JSON.stringify(metadata)]
  );
}

async function upsertAnalytics(partnerId, metrics) {
  const {
    rolling_avg_rating,
    trend_30_day,
    sentiment_avg,
    flag_ratio,
    risk_score,
    review_count,
  } = metrics;
  await pool.query(
    `INSERT INTO ${TABLE_ANALYTICS} (
      partner_id, rolling_avg_rating, trend_30_day, sentiment_avg, flag_ratio, risk_score, review_count, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMPTZ)
    ON CONFLICT (partner_id) DO UPDATE SET
      rolling_avg_rating = EXCLUDED.rolling_avg_rating,
      trend_30_day = EXCLUDED.trend_30_day,
      sentiment_avg = EXCLUDED.sentiment_avg,
      flag_ratio = EXCLUDED.flag_ratio,
      risk_score = EXCLUDED.risk_score,
      review_count = EXCLUDED.review_count,
      updated_at = CURRENT_TIMESTAMPTZ`,
    [
      partnerId,
      rolling_avg_rating ?? null,
      trend_30_day ?? null,
      sentiment_avg ?? null,
      flag_ratio ?? null,
      risk_score ?? null,
      review_count ?? 0,
    ]
  );
}

async function getById(reviewId) {
  const r = await pool.query(
    `SELECT * FROM ${TABLE_REVIEWS} WHERE id = $1`,
    [reviewId]
  );
  return r.rows[0] || null;
}

async function softDelete(reviewId) {
  const r = await pool.query(
    `UPDATE ${TABLE_REVIEWS} SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [reviewId]
  );
  return r.rows[0] || null;
}

async function restore(reviewId) {
  const r = await pool.query(
    `UPDATE ${TABLE_REVIEWS} SET deleted_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
    [reviewId]
  );
  return r.rows[0] || null;
}

async function listAuditLog(reviewId, limit = 50) {
  const r = await pool.query(
    `SELECT id, review_id, action_type, actor_id, actor_role, metadata, created_at
     FROM ${TABLE_AUDIT} WHERE review_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [reviewId, limit]
  );
  return r.rows;
}

/** Get latest AUTO_FLAGGED reason_codes from audit for a review (for partner moderation reason) */
async function getLastAutoFlaggedReason(reviewId) {
  const r = await pool.query(
    `SELECT metadata FROM ${TABLE_AUDIT}
     WHERE review_id = $1 AND action_type = 'AUTO_FLAGGED' ORDER BY created_at DESC LIMIT 1`,
    [reviewId]
  );
  const meta = r.rows[0]?.metadata;
  return (meta && meta.reason_codes) || [];
}

module.exports = {
  getPartnerSettings,
  findRedemptionForReview,
  hasReviewForRedemption,
  createReview,
  listByPartner,
  getAggregate,
  insertAuditLog,
  upsertAnalytics,
  getById,
  softDelete,
  restore,
  listAuditLog,
  countReviewsForPartnerInLastMinutes,
  countReviewsForPartnerAndIpInLastHours,
  isUserBlockedForReviews,
  blockUserForReviews,
  unblockUserForReviews,
  markReviewMalicious,
  setReviewDisputeRequest,
  getLastAutoFlaggedReason,
};
