/**
 * Run co_pay_percentage_at_booking migration on bookings table.
 * Adds column so redemption uses deal co-pay at booking time, not current deal.
 */

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');

const pool = getPool();

async function runMigration() {
  const client = await pool.connect();
  try {
    log('Running co_pay_percentage_at_booking migration...');
    const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-bookings-co-pay-at-booking.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error('Migration file not found: ' + migrationPath);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    log('Migration completed.');
    const check = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'co_pay_percentage_at_booking'`
    );
    if (check.rows.length) {
      log('Verified: bookings.co_pay_percentage_at_booking exists.');
    }
  } catch (err) {
    logError('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => { process.exit(0); })
  .catch(() => { process.exit(1); });
