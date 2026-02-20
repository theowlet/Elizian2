#!/usr/bin/env node
/**
 * Run Bookings table migrations (required by bookingRepository).
 * Run from backend: node run-bookings-migrations.js
 *
 * Order:
 * 1. 2025-01-21-fix-all-bookings-columns.sql
 * 2. 2025-01-22-voucher-redemption-system.sql
 * 3. 20251108_ezt_token_updates.sql
 * 4. deal_slots.sql
 */

const path = require('path');
const fs = require('fs');
const { getPool } = require('./src/config/db');
const { log, logError } = require('./utils/logger');

const MIGRATIONS = [
  'db/migrations/2025-01-21-fix-all-bookings-columns.sql',
  'db/migrations/2025-01-22-voucher-redemption-system.sql',
  'db/migrations/2025-01-22-enterprise-voucher-system.sql',  // voucher_state
  'db/migrations/2025-01-23-bookings-expires-at.sql',        // expires_at
  'db/20251108_ezt_token_updates.sql',
  'db/deal_slots.sql',
  'db/migrations/2026-02-enterprise-booking-engine.sql',    // is_priority_override
  'db/migrations/2026-02-bookings-co-pay-at-booking.sql',  // co_pay_percentage_at_booking
  'db/migrations/2026-02-booking-reward-multiplier.sql',   // reward_multiplier (campaign EZT boost)
];

async function run() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    for (const relPath of MIGRATIONS) {
      const fullPath = path.join(__dirname, relPath);
      if (!fs.existsSync(fullPath)) {
        log(`⚠️  Skipping ${relPath} (file not found)`);
        continue;
      }

      const sql = fs.readFileSync(fullPath, 'utf8');
      log(`🔄 Running ${path.basename(fullPath)}...`);

      try {
        await client.query(sql);
        log(`✅ ${path.basename(fullPath)} completed`);
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          log(`⚠️  ${path.basename(fullPath)}: some objects may already exist (ok)`);
        } else {
          throw err;
        }
      }
    }

    log('✅ All bookings migrations completed');
  } catch (err) {
    logError('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
