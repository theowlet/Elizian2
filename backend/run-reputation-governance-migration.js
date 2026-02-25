/**
 * Run Reputation Governance + Layer 5 migration
 * Adds ip_address, marked_malicious_*, dispute_* to reputation_reviews; creates blocked_review_users.
 * Run after run-reputation-migration.js.
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
    log('🔄 Running Reputation Governance + Layer 5 migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-reputation-governance-layer5.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_review_users'`
    );
    if (r.rows.length) log('✅ blocked_review_users ready');
    log('✅ Reputation Governance migration completed successfully');
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
