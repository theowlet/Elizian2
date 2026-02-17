/**
 * Run Enterprise Booking Engine migration
 * Adds venue_time_slots, bookings.is_priority_override (additive only)
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
    log('🔄 Running Enterprise Booking Engine migration...');

    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-enterprise-booking-engine.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);

    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venue_time_slots'`
    );
    const columnCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'is_priority_override'`
    );

    if (tableCheck.rows.length) log('✅ venue_time_slots table ready');
    if (columnCheck.rows.length) log('✅ bookings.is_priority_override column ready');
    log('✅ Enterprise Booking Engine migration completed successfully');

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
