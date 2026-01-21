const { getPool } = require('../config/db');

const pool = getPool();

// Ensure partner_otps table exists
async function ensurePartnerOtpsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      otp VARCHAR(10) NOT NULL,
      type VARCHAR(50) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      is_used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_partner_otps_partner ON partner_otps(partner_id);
    CREATE INDEX IF NOT EXISTS idx_partner_otps_type ON partner_otps(type);
  `);
}

// Create OTP record
async function createOtp(partnerId, otp, type, expiresAt) {
  await ensurePartnerOtpsTable();
  
  const result = await pool.query(
    `INSERT INTO partner_otps (partner_id, otp, type, expires_at, is_used) 
     VALUES ($1, $2, $3, $4, false)
     RETURNING *`,
    [partnerId, otp, type, expiresAt]
  );
  return result.rows[0];
}

// Verify OTP
async function verifyOtp(email, otp, type) {
  const result = await pool.query(
    `SELECT po.*, p.id as partner_id, p.name, p.email 
     FROM partner_otps po
     JOIN partners p ON po.partner_id = p.id
     WHERE LOWER(p.email) = LOWER($1) 
     AND po.otp = $2 
     AND po.type = $3
     AND po.is_used = false
     AND po.expires_at > NOW()
     ORDER BY po.created_at DESC
     LIMIT 1`,
    [email, otp, type]
  );
  return result.rows[0];
}

// Mark OTP as used
async function markOtpAsUsed(otpId) {
  await pool.query(
    "UPDATE partner_otps SET is_used = true WHERE id = $1",
    [otpId]
  );
}

// Check recent OTP requests (rate limiting)
async function countRecentOtps(partnerId, type, minutes = 1) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM partner_otps 
     WHERE partner_id = $1 
     AND type = $2
     AND created_at > NOW() - INTERVAL '${minutes} minute'`,
    [partnerId, type]
  );
  return parseInt(result.rows[0].count || 0);
}

module.exports = {
  ensurePartnerOtpsTable,
  createOtp,
  verifyOtp,
  markOtpAsUsed,
  countRecentOtps
};

