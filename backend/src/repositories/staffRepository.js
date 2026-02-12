const { getPool } = require('../config/db');
const pool = getPool();

async function listByPartner(partnerId) {
  const result = await pool.query(
    `SELECT ps.id, ps.partner_id, ps.user_id, ps.role, ps.created_at,
            u.first_name, u.last_name, u.email, u.phone_number
     FROM partner_staff ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.partner_id = $1
     ORDER BY ps.created_at DESC`,
    [partnerId]
  );
  return result.rows;
}

async function add(partnerId, userId, role = 'staff') {
  const result = await pool.query(
    `INSERT INTO partner_staff (partner_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (partner_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [partnerId, userId, role]
  );
  return result.rows[0];
}

async function remove(partnerId, userId) {
  const result = await pool.query(
    'DELETE FROM partner_staff WHERE partner_id = $1 AND user_id = $2 RETURNING id',
    [partnerId, userId]
  );
  return result.rowCount > 0;
}

async function isStaff(partnerId, userId) {
  const result = await pool.query(
    'SELECT 1 FROM partner_staff WHERE partner_id = $1 AND user_id = $2',
    [partnerId, userId]
  );
  return result.rows.length > 0;
}

async function recordCheckIn(partnerId, userId, eztEarned = 0, notes = null) {
  const result = await pool.query(
    `INSERT INTO staff_check_ins (partner_id, user_id, ezt_earned, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [partnerId, userId, eztEarned, notes]
  );
  return result.rows[0];
}

async function listCheckIns(partnerId, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT sci.id, sci.partner_id, sci.user_id, sci.checked_in_at, sci.ezt_earned, sci.notes,
            u.first_name, u.last_name, u.email
     FROM staff_check_ins sci
     JOIN users u ON u.id = sci.user_id
     WHERE sci.partner_id = $1
     ORDER BY sci.checked_in_at DESC
     LIMIT $2 OFFSET $3`,
    [partnerId, limit, offset]
  );
  return result.rows;
}

/** Find user by email for adding as staff */
async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0];
}

module.exports = {
  listByPartner,
  add,
  remove,
  isStaff,
  recordCheckIn,
  listCheckIns,
  findUserByEmail,
};
