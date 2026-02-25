const { getPool } = require('../config/db');
const pool = getPool();

async function listPassProducts(partnerId = null) {
  let query = `SELECT id, name, partner_id, description, valid_from, valid_until, is_active, created_at FROM subscription_passes WHERE is_active = true`;
  const params = [];
  if (partnerId) {
    query += ` AND (partner_id = $1 OR partner_id IS NULL)`;
    params.push(partnerId);
  }
  query += ` ORDER BY name`;
  const r = await pool.query(query, params);
  return r.rows;
}

async function getPassProductById(id) {
  const r = await pool.query(`SELECT * FROM subscription_passes WHERE id = $1`, [id]);
  return r.rows[0];
}

async function listUserPasses(userId) {
  const r = await pool.query(
    `SELECT usp.id, usp.user_id, usp.subscription_pass_id, usp.code, usp.redeemed_at, usp.created_at,
            sp.name AS pass_name, sp.description, sp.partner_id, sp.valid_from, sp.valid_until,
            p.name AS partner_name
     FROM user_subscription_passes usp
     JOIN subscription_passes sp ON sp.id = usp.subscription_pass_id
     LEFT JOIN partners p ON p.id = sp.partner_id
     WHERE usp.user_id = $1
     ORDER BY usp.created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function claimPass(userId, subscriptionPassId, code) {
  const trimmed = code.trim();
  const r = await pool.query(
    `INSERT INTO user_subscription_passes (user_id, subscription_pass_id, code)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO NOTHING
     RETURNING *`,
    [userId, subscriptionPassId, trimmed]
  );
  if (r.rows[0]) return r.rows[0];
  const existing = await pool.query(
    `SELECT * FROM user_subscription_passes WHERE code = $1`,
    [trimmed]
  );
  return existing.rows[0] || null;
}

async function findByCode(code) {
  const r = await pool.query(
    `SELECT usp.*, sp.name AS pass_name, sp.partner_id FROM user_subscription_passes usp
     JOIN subscription_passes sp ON sp.id = usp.subscription_pass_id
     WHERE usp.code = $1 AND usp.redeemed_at IS NULL`,
    [code.trim()]
  );
  return r.rows[0];
}

async function redeemByCode(code) {
  const r = await pool.query(
    `UPDATE user_subscription_passes SET redeemed_at = CURRENT_TIMESTAMP WHERE code = $1 AND redeemed_at IS NULL RETURNING *`,
    [code.trim()]
  );
  return r.rows[0];
}

module.exports = {
  listPassProducts,
  getPassProductById,
  listUserPasses,
  claimPass,
  findByCode,
  redeemByCode,
};
