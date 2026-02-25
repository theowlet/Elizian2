/**
 * Run membership cards avatar columns migration (S3-native, additive only).
 * Adds: avatar_type, avatar_original_url, avatar_display_url, avatar_filter_type, avatar_metadata.
 */

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');

const pool = getPool();

async function runMigration() {
  const client = await pool.connect();
  try {
    log('🔄 Running membership cards avatar (S3) migration...');
    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-membership-cards-avatar-s3.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    log('✅ Membership cards avatar migration completed.');
    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_venue_membership_cards'
      AND column_name IN ('avatar_type', 'avatar_display_url')
    `);
    if (check.rows.length >= 2) log('✅ Verified: avatar columns exist.');
  } catch (err) {
    logError('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => { process.exit(0); })
  .catch(() => { process.exit(1); });
