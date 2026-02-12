const { getPool } = require('../config/db');
const pool = getPool();

async function signup(partnerId, userId) {
  const r = await pool.query(
    `INSERT INTO venue_prelaunch_signups (partner_id, user_id) VALUES ($1, $2)
     ON CONFLICT (partner_id, user_id) DO NOTHING RETURNING *`,
    [partnerId, userId]
  );
  return r.rows[0];
}

async function listByPartner(partnerId) {
  const r = await pool.query(
    `SELECT s.id, s.partner_id, s.user_id, s.created_at, u.first_name, u.last_name, u.email
     FROM venue_prelaunch_signups s
     JOIN users u ON u.id = s.user_id
     WHERE s.partner_id = $1 ORDER BY s.created_at DESC`,
    [partnerId]
  );
  return r.rows;
}

async function listByUser(userId) {
  const r = await pool.query(
    `SELECT s.id, s.partner_id, s.user_id, s.created_at, p.name AS partner_name
     FROM venue_prelaunch_signups s
     JOIN partners p ON p.id = s.partner_id
     WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function isSignedUp(partnerId, userId) {
  const r = await pool.query(
    `SELECT 1 FROM venue_prelaunch_signups WHERE partner_id = $1 AND user_id = $2`,
    [partnerId, userId]
  );
  return r.rowCount > 0;
}

module.exports = { signup, listByPartner, listByUser, isSignedUp };
