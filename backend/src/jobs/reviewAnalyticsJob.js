/**
 * Reputation analytics job: compute review_analytics from reputation_reviews.
 * Run on schedule or after review insert. No heavy aggregation in request path.
 */
const { getPool } = require('../config/db');
const reputationReviewRepository = require('../repositories/reputationReviewRepository');
const { log, logError } = require('../utils/logger');

const pool = getPool();

/**
 * Partner reputation score (weighted):
 * - Average rating 40%
 * - Recent trend 20%
 * - Sentiment 15%
 * - Flagged ratio 15%
 * - Complaint frequency 10% (placeholder)
 */
function computeReputationScore(row) {
  const avgRating = row.rolling_avg_rating != null ? parseFloat(row.rolling_avg_rating) : null;
  const trend = row.trend_30_day != null ? parseFloat(row.trend_30_day) : 0;
  const sentiment = row.sentiment_avg != null ? parseFloat(row.sentiment_avg) : 0;
  const flagRatio = row.flag_ratio != null ? parseFloat(row.flag_ratio) : 0;
  const ratingNorm = avgRating != null ? (avgRating - 1) / 4 : 0.5;
  const trendNorm = Math.max(-1, Math.min(1, trend)) * 0.5 + 0.5;
  const sentimentNorm = sentiment * 0.5 + 0.5;
  const flagPenalty = 1 - flagRatio;
  const score = ratingNorm * 0.4 + trendNorm * 0.2 + sentimentNorm * 0.15 + flagPenalty * 0.15 + 0.1;
  return Math.max(0, Math.min(1, score));
}

/**
 * Merchant risk score: negative velocity, refund correlation, dispute frequency, toxic clustering.
 * Placeholder: derived from flag_ratio and negative sentiment.
 */
function computeRiskScore(row) {
  const flagRatio = row.flag_ratio != null ? parseFloat(row.flag_ratio) : 0;
  const sentiment = row.sentiment_avg != null ? parseFloat(row.sentiment_avg) : 0;
  const negativeSentiment = sentiment < 0 ? Math.abs(sentiment) : 0;
  return Math.min(1, flagRatio * 0.6 + negativeSentiment * 0.4);
}

async function runForPartner(partnerId) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS review_count,
       ROUND(AVG(rating)::numeric, 2) AS rolling_avg_rating,
       ROUND(AVG(sentiment_score)::numeric, 4) AS sentiment_avg,
       COUNT(*) FILTER (WHERE moderation_status = 'FLAGGED')::float / NULLIF(COUNT(*), 0) AS flag_ratio,
       ROUND(
         (AVG(rating) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'))::numeric, 2
       ) AS trend_30_day
     FROM reputation_reviews
     WHERE partner_id = $1 AND deleted_at IS NULL AND is_visible = true`,
    [partnerId]
  );
  const row = r.rows[0];
  if (!row || row.review_count === 0) {
    await reputationReviewRepository.upsertAnalytics(partnerId, {
      rolling_avg_rating: null,
      trend_30_day: null,
      sentiment_avg: null,
      flag_ratio: null,
      risk_score: null,
      review_count: 0,
    });
    return;
  }
  const trend_30_day = row.trend_30_day != null ? parseFloat(row.trend_30_day) : null;
  const flag_ratio = parseFloat(row.flag_ratio || 0);
  const risk_score = computeRiskScore({
    flag_ratio,
    sentiment_avg: row.sentiment_avg,
  });
  await reputationReviewRepository.upsertAnalytics(partnerId, {
    rolling_avg_rating: parseFloat(row.rolling_avg_rating),
    trend_30_day,
    sentiment_avg: row.sentiment_avg ? parseFloat(row.sentiment_avg) : null,
    flag_ratio,
    risk_score,
    review_count: row.review_count,
  });
}

async function runAll() {
  const partnerIds = await pool.query(
    `SELECT DISTINCT partner_id FROM reputation_reviews WHERE deleted_at IS NULL`
  );
  let ok = 0;
  let err = 0;
  for (const { partner_id } of partnerIds.rows) {
    try {
      await runForPartner(partner_id);
      ok++;
    } catch (e) {
      logError('Review analytics job partner ' + partner_id, e?.message);
      err++;
    }
  }
  log(`[ReviewAnalyticsJob] Updated ${ok} partners, ${err} errors`);
  return { updated: ok, errors: err };
}

module.exports = {
  runForPartner,
  runAll,
  computeReputationScore,
  computeRiskScore,
};
