/**
 * Run Dynamic Partner Tiers migration
 * Creates partner_tiers table, platform_earnings_ledger, adds partners.tier_id, seeds Gold/Silver/Bronze, backfills and drops partner_tier.
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
    log('🔄 Running Dynamic Partner Tiers migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-dynamic-partner-tiers.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'partner_tiers'`
    );
    const tierIdCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'tier_id'`
    );

    if (tableCheck.rows.length && tierIdCheck.rows.length) {
      log('✅ partner_tiers table and partners.tier_id ready');
      log('✅ Dynamic Partner Tiers migration completed successfully');
    } else {
      throw new Error('Migration ran but partner_tiers or partners.tier_id was not created');
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
