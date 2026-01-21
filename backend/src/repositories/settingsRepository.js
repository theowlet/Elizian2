const { getPool } = require('../config/db');

const pool = getPool();

// Get system setting value
async function getSystemSetting(key) {
  const result = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = $1",
    [key]
  );
  return result.rows[0]?.setting_value || null;
}

module.exports = {
  getSystemSetting
};

