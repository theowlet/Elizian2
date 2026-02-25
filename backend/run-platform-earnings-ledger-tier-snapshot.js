/**
 * Run platform_earnings_ledger tier snapshot migration.
 * Adds tier_name, tier_percentage to platform_earnings_ledger and backfills from partner_tiers.
 * Run from backend: node run-platform-earnings-ledger-tier-snapshot.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./src/utils/logger');

async function runMigration() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    log('🔄 Running platform_earnings_ledger tier snapshot migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-platform-earnings-ledger-tier-snapshot.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'platform_earnings_ledger'
       AND column_name IN ('tier_name', 'tier_percentage')`
    );
    if (colCheck.rows.length >= 2) {
      log('✅ platform_earnings_ledger.tier_name and tier_percentage ready');
      log('✅ Platform earnings ledger tier snapshot migration completed successfully');
    } else {
      log('⚠️ Migration ran but tier_name/tier_percentage may be missing; check schema.');
    }
  } catch (error) {
    logError('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
