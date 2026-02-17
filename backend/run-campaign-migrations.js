/**
 * Run Campaign Engine migrations (creates campaigns table and related tables).
 * Run from backend: node run-campaign-migrations.js
 * Order: 2026-02-campaign-architecture.sql then 2026-02-enterprise-campaign-engine.sql
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./src/utils/logger');

const MIGRATIONS = [
  'db/migrations/2026-02-campaign-architecture.sql',
  'db/migrations/2026-02-enterprise-campaign-engine.sql',
];

async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    for (const relPath of MIGRATIONS) {
      const migrationPath = path.join(__dirname, relPath);
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`);
      }
      log(`🔄 Running ${path.basename(migrationPath)}...`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await client.query(sql);
      log(`✅ ${path.basename(migrationPath)} completed`);
    }

    const check = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns'`
    );
    if (check.rows.length) log('✅ campaigns table ready');
    else throw new Error('campaigns table still missing after migrations');

    log('✅ Campaign migrations completed successfully');
  } catch (error) {
    logError('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
