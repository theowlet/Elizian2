const { getPool } = require('../config/db');
const pool = getPool();

async function create({ from_user_id, partner_id, booking_id, amount_decimal, currency = 'INR', payment_method = 'ezt', notes }) {
  const result = await pool.query(
    `INSERT INTO tips (from_user_id, partner_id, booking_id, amount_decimal, currency, payment_method, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)
     RETURNING *`,
    [from_user_id, partner_id, booking_id || null, amount_decimal, currency, payment_method, notes || null]
  );
  return result.rows[0];
}

async function listByPartner(partnerId, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT t.*, u.first_name, u.last_name
     FROM tips t
     JOIN users u ON u.id = t.from_user_id
     WHERE t.partner_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [partnerId, limit, offset]
  );
  return result.rows;
}

async function listByUser(userId, limit = 50) {
  const result = await pool.query(
    `SELECT t.*, p.name AS partner_name
     FROM tips t
     JOIN partners p ON p.id = t.partner_id
     WHERE t.from_user_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

module.exports = {
  create,
  listByPartner,
  listByUser,
};
