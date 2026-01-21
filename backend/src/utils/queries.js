const { getPool } = require('../config/db');
const { logError } = require('./logger');

const pool = getPool();

// Get user role by ID
async function getUserRoleById(userId) {
  try {
    const result = await pool.query(
      `SELECT r.role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0]?.role_name || null;
  } catch (e) {
    return null;
  }
}

// Extract city from address string
function extractCity(address) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  return parts[parts.length - 1] || null;
}

module.exports = {
  getUserRoleById,
  extractCity
};

