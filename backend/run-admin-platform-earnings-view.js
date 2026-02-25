/**
 * Create admin_platform_earnings_view (read-only reporting view).
 * Run after platform_earnings_ledger tier snapshot migration.
 * Run from backend: node run-admin-platform-earnings-view.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./src/utils/logger');

async function run() {
  const pool = getPool();
  const sqlPath = path.join(__dirname, 'db', 'migrations', '2026-02-admin-platform-earnings-view.sql');
  if (!fs.existsSync(sqlPath)) {
    logError('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  log('✅ admin_platform_earnings_view created');
  process.exit(0);
}

run().catch((err) => {
  logError('Migration failed:', err);
  process.exit(1);
});
