/**
 * Run Reputation & Intelligence System migration
 * Creates reputation_reviews, review_audit_logs, partner_review_settings, review_analytics (additive only)
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
    log('🔄 Running Reputation Intelligence migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-reputation-intelligence.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const tables = ['reputation_reviews', 'review_audit_logs', 'partner_review_settings', 'review_analytics'];
    for (const table of tables) {
      const r = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      if (r.rows.length) log(`✅ ${table} ready`);
    }
    log('✅ Reputation Intelligence migration completed successfully');

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
