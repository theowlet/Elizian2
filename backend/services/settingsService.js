const { getPool } = require('../src/config/db');
const { logError } = require('../utils/logger');

let systemSettingsEnsured = false;
const pool = getPool();

async function ensureSystemSettingsTable() {
  if (systemSettingsEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        description TEXT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      INSERT INTO system_settings (setting_key, setting_value, description) VALUES
        ('loyalty_multiplier', '1', 'Points earned per ₹100 spent (default: 1 point per ₹100)'),
        ('commission_percentage', '10.0', 'Default commission percentage for partners'),
        ('voucher_expiry_days', '30', 'Voucher expiry in days from booking date'),
        ('archive_expired_after_days', '7', 'Auto-archive offers after X days of expiry')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    systemSettingsEnsured = true;
  } catch (err) {
    logError('⚠️ System settings ensure failed:', err.message || err);
  }
}

async function getSystemSetting(key, defaultValue = null) {
  try {
    await ensureSystemSettingsTable();
    const result = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1',
      [key]
    );
    if (result.rows.length > 0) {
      return result.rows[0].setting_value;
    }
  } catch (err) {
    logError(`⚠️ Failed to read system setting "${key}":`, err.message || err);
  }
  return defaultValue;
}

module.exports = {
  ensureSystemSettingsTable,
  getSystemSetting
};

