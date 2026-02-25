/**
 * Customer ecosystem summary for chat header and customer overview.
 * All values are computed from DB; no hardcoding.
 *
 * Data semantics:
 * - lifetimeSpendFiat: Sum of bookings.fiat_amount for this user. Only non-cancelled
 *   bookings are counted (status NOT IN ('cancelled')). Includes confirmed, redeemed,
 *   completed, etc. Represents total fiat value of bookings that "count" toward spend.
 * - totalVisits: Count of those same bookings (one per booking).
 * - totalEztEarned: users.total_tokens_earned — lifetime EZT ever awarded (earned from spend).
 * - currentEztBalance: users.available_tokens — current spendable EZT. Difference from
 *   totalEztEarned is what was spent (redemptions); total_tokens_spent is the same delta.
 * - loyaltyCredits: From loyalty_activity.balance_after (latest) if table exists; else
 *   falls back to currentEztBalance so the UI can show a "Credits" value.
 */
const { getPool } = require('../config/db');
const { normalizeTierName } = require('../utils/tierNames');
const { logError } = require('../utils/logger');

const pool = getPool();

/**
 * Get ecosystem-wide metrics for the authenticated customer.
 * User ID must come from JWT (req.userId); do not accept user id from query/body.
 * @param {string} userId - From JWT only
 * @returns {Promise<{ tier, lifetimeSpendFiat, totalVisits, totalEztEarned, currentEztBalance, loyaltyCredits }>}
 */
async function getEcosystemSummary(userId) {
  if (!userId) {
    throw new Error('User ID required');
  }

  const result = await pool.query(
    `SELECT
       u.current_tier_name,
       u.available_tokens,
       u.total_tokens_earned,
       COALESCE(SUM(b.fiat_amount), 0)::numeric AS lifetime_spend_fiat,
       COUNT(b.id)::int AS total_visits
     FROM users u
     LEFT JOIN bookings b ON b.user_id = u.id AND b.status NOT IN ('cancelled')
     WHERE u.id = $1
     GROUP BY u.id, u.current_tier_name, u.available_tokens, u.total_tokens_earned`,
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      tier: 'Ather',
      lifetimeSpendFiat: 0,
      totalVisits: 0,
      totalEztEarned: 0,
      currentEztBalance: 0,
      loyaltyCredits: 0,
    };
  }

  const row = result.rows[0];
  const tier = normalizeTierName(row.current_tier_name) || 'Ather';
  const currentEztBalance = parseFloat(row.available_tokens || 0);
  const totalEztEarned = parseFloat(row.total_tokens_earned || 0);
  const lifetimeSpendFiat = parseFloat(row.lifetime_spend_fiat || 0);
  const totalVisits = parseInt(row.total_visits || 0, 10);

  let loyaltyCredits = currentEztBalance;
  try {
    const loyaltyResult = await pool.query(
      `SELECT balance_after FROM loyalty_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (loyaltyResult.rows[0] != null && loyaltyResult.rows[0].balance_after != null) {
      loyaltyCredits = parseFloat(loyaltyResult.rows[0].balance_after);
    }
  } catch (e) {
    if (e.code !== '42P01') logError('Ecosystem summary loyalty_activity:', e.message);
    loyaltyCredits = Math.round(currentEztBalance * 100) / 100;
  }

  return {
    tier,
    lifetimeSpendFiat,
    totalVisits,
    totalEztEarned,
    currentEztBalance,
    loyaltyCredits,
  };
}

module.exports = {
  getEcosystemSummary,
};
