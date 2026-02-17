/**
 * Run Partner Tier migration
 * Adds partners.partner_tier column (bronze/silver/gold)
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
    log('🔄 Running Partner Tier migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-partner-subscription-tier.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const colCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'partner_tier'`
    );

    if (colCheck.rows.length) {
      log('✅ partners.partner_tier column ready');
      log('✅ Partner Tier migration completed successfully');
    } else {
      throw new Error('Migration ran but partner_tier column was not created');
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
