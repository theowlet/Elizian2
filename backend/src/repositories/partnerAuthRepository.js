const { getPool } = require('../config/db');
const bcrypt = require('bcryptjs');

const pool = getPool();

// Get partner auth by partner ID
async function getPartnerAuth(partnerId) {
  const result = await pool.query(
    `SELECT password_hash FROM partner_auth WHERE partner_id = $1`,
    [partnerId]
  );
  return result.rows[0];
}

// Create partner auth record
async function createPartnerAuth(partnerId, passwordHash) {
  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_auth (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const result = await pool.query(
    `INSERT INTO partner_auth (partner_id, password_hash)
     VALUES ($1, $2)
     RETURNING *`,
    [partnerId, passwordHash]
  );
  return result.rows[0];
}

// Update partner password
async function updatePartnerPassword(partnerId, passwordHash) {
  const result = await pool.query(
    `UPDATE partner_auth 
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE partner_id = $2
     RETURNING *`,
    [passwordHash, partnerId]
  );
  return result.rows[0];
}

// Hash password
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Compare password
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

module.exports = {
  getPartnerAuth,
  createPartnerAuth,
  updatePartnerPassword,
  hashPassword,
  comparePassword
};

