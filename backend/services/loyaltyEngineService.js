const { getPool } = require('../src/config/db');
const { log, logError } = require('../utils/logger');
const { getSystemSetting } = require('./settingsService');

const pool = getPool();

async function getCurrentBalance(userId) {
  const result = await pool.query(
    `SELECT balance_after 
     FROM loyalty_activity 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userId]
  );
  return parseFloat(result.rows[0]?.balance_after || 0);
}

async function calculateEarning(userId, amount) {
  const multiplierSetting = await getSystemSetting('loyalty_multiplier', '1');
  const multiplier = parseFloat(multiplierSetting) || 1;
  const points = Math.floor((amount / 100) * multiplier);

  const tierResult = await pool.query(
    `SELECT tiers.id, tiers.name, tiers.level, thresholds.min_spend, thresholds.earning_multiplier
     FROM tiers
     LEFT JOIN loyalty_tier_thresholds thresholds ON thresholds.tier_id = tiers.id
     ORDER BY tiers.level ASC`
  );

  return {
    points,
    multiplier,
    tiers: tierResult.rows
  };
}

async function recordActivity({
  userId,
  source,
  referenceId,
  amount = 0,
  pointsEarned = 0,
  pointsSpent = 0,
  description = null,
  metadata = null
}) {
  try {
    const previousBalance = await getCurrentBalance(userId);
    const balanceAfter = previousBalance + pointsEarned - pointsSpent;

    await pool.query(
      `INSERT INTO loyalty_activity (
        user_id, source, description, points_earned, points_spent,
        balance_after, reference_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        source,
        description,
        pointsEarned,
        pointsSpent,
        balanceAfter,
        referenceId || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await pool.query(
      `INSERT INTO loyalty_points (user_id, booking_id, points_earned, points_spent, points_balance, transaction_type, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        referenceId || null,
        pointsEarned || 0,
        pointsSpent || 0,
        balanceAfter,
        source,
        description
      ]
    );

    return { balanceAfter };
  } catch (err) {
    logError('⚠️ Loyalty recordActivity failed:', err.message || err);
    throw err;
  }
}

async function getProgress(userId) {
  const userResult = await pool.query(
    `SELECT u.id, u.current_tier_id, tp.total_spend, t.name as tier_name, t.level, thresholds.min_spend, thresholds.earning_multiplier
     FROM users u
     LEFT JOIN tier_progress tp ON tp.user_id = u.id
     LEFT JOIN tiers t ON u.current_tier_id = t.id
     LEFT JOIN loyalty_tier_thresholds thresholds ON thresholds.tier_id = t.id
     WHERE u.id = $1`,
    [userId]
  );

  const nextTier = await pool.query(
    `SELECT tiers.id, tiers.name, tiers.level, thresholds.min_spend
     FROM tiers
     LEFT JOIN loyalty_tier_thresholds thresholds ON thresholds.tier_id = tiers.id
     WHERE tiers.level = (SELECT level + 1 FROM tiers WHERE id = $1)
     LIMIT 1`,
    [userResult.rows[0]?.current_tier_id]
  );

  return {
    current: userResult.rows[0] || null,
    next: nextTier.rows[0] || null,
    balance: await getCurrentBalance(userId)
  };
}

async function getHistory(userId, { limit = 20, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT * FROM loyalty_activity
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

module.exports = {
  calculateEarning,
  recordActivity,
  getProgress,
  getHistory
};

