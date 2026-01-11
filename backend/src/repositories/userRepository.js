const { getPool } = require('../config/db');

const pool = getPool();

// Get user tier ID from tiers table (for transactions FK constraint)
// The transactions table references tiers(id), not loyalty_tiers(id)
async function getUserTierId(userId) {
  // First get the user's tier name
  const userResult = await pool.query(
    'SELECT current_tier_name FROM users WHERE id = $1',
    [userId]
  );
  
  if (!userResult.rows[0] || !userResult.rows[0].current_tier_name) {
    return null;
  }
  
  const tierName = userResult.rows[0].current_tier_name;
  
  // Then get the tier ID from the tiers table (not loyalty_tiers)
  // This matches the FK constraint: transactions.user_tier_at_transaction REFERENCES tiers(id)
  const tierResult = await pool.query(
    'SELECT id FROM tiers WHERE name = $1',
    [tierName]
  );
  
  return tierResult.rows[0]?.id || null;
}

module.exports = {
  getUserTierId
};

