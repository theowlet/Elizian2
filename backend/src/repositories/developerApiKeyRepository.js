const { getPool } = require('../config/db');
const pool = getPool();

async function createKey({ userId, name, keyHash, keyPrefix, scopes = ['vouchers:validate', 'loyalty:read'], rateLimitPerMin = 60 }) {
  const result = await pool.query(
    `INSERT INTO developer_api_keys (user_id, name, key_hash, key_prefix, scopes, rate_limit_per_min)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, name, key_prefix, scopes, rate_limit_per_min, is_active, created_at`,
    [userId, name, keyHash, keyPrefix, JSON.stringify(scopes), rateLimitPerMin]
  );
  return result.rows[0];
}

async function findByPrefix(keyPrefix) {
  const result = await pool.query(
    `SELECT id, user_id, name, key_hash, key_prefix, scopes, rate_limit_per_min, is_active
     FROM developer_api_keys WHERE key_prefix = $1 AND is_active = true`,
    [keyPrefix]
  );
  return result.rows[0];
}

async function listByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id, name, key_prefix, scopes, rate_limit_per_min, is_active, last_used_at, created_at
     FROM developer_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function revokeKey(keyId, userId) {
  const result = await pool.query(
    `UPDATE developer_api_keys SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id`,
    [keyId, userId]
  );
  return result.rows[0];
}

async function recordUsage(keyId) {
  await pool.query(
    `UPDATE developer_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [keyId]
  );
}

module.exports = {
  createKey,
  findByPrefix,
  listByUserId,
  revokeKey,
  recordUsage,
};
