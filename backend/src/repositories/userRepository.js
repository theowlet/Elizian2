const { getPool } = require('../config/db');

const pool = getPool();

// Get user tier ID
async function getUserTierId(userId) {
  const result = await pool.query('SELECT current_tier_id FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.current_tier_id || null;
}

module.exports = {
  getUserTierId
};

