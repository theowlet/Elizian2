const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');

const pool = getPool();

// Get system setting value with error handling
async function getSystemSetting(key) {
  try {
    // Check if system_settings table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_settings'
      );
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      logError(`⚠️ system_settings table does not exist, returning null for key: ${key}`);
      return null;
    }

    const result = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1",
      [key]
    );
    return result.rows[0]?.setting_value || null;
  } catch (error) {
    logError(`❌ Error fetching system setting '${key}':`, error.message);
    // Return null instead of throwing to allow booking to proceed with defaults
    return null;
  }
}

module.exports = {
  getSystemSetting
};

