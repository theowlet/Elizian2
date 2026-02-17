#!/usr/bin/env node
/**
 * Load test: concurrency-safe slot booking and waitlist promotion
 * Run after migration. Uses DB from env (DATABASE_URL or DB_*).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getPool } = require('../src/config/db');
const slotCapacityService = require('../src/services/slotCapacityService');
const waitlistService = require('../src/services/waitlistService');
const { log } = require('../src/utils/logger');

const pool = getPool();

async function getPartnerId() {
  const r = await pool.query(
    `SELECT id FROM partners WHERE is_active = true AND status IN ('active','approved') LIMIT 1`
  );
  if (!r.rows[0]) throw new Error('No active partner found');
  return r.rows[0].id;
}

async function main() {
  log('--- Load test: Enterprise Booking Engine ---');

  const partnerId = await getPartnerId();
  log(`Using partner_id: ${partnerId}`);

  const slotDt = new Date(Date.UTC(2026, 2, 1, 19, 0, 0, 0)); // 2026-03-01 19:00 UTC

  const exists = await slotCapacityService.slotTableExists(pool);
  if (!exists) {
    log('SKIP: venue_time_slots table missing (run migration first)');
    process.exit(0);
  }

  await pool.query(
    `INSERT INTO venue_time_slots (partner_id, slot_datetime, capacity, booked_count, echelon_buffer)
     VALUES ($1, $2, 5, 0, 2)
     ON CONFLICT (partner_id, slot_datetime) DO UPDATE SET booked_count = 0`,
    [partnerId, slotDt]
  );
  log('Slot created: 2026-03-01 19:00, capacity=5, echelon_buffer=2');

  // 8 parallel reserve attempts (no Echelon)
  const concurrency = 8;
  const results = await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await slotCapacityService.reserveSlot(
          client,
          partnerId,
          slotDt,
          false,
          1,
          5,
          2
        );
        if (result.status === 'CONFIRMED') {
          await client.query('COMMIT');
          return 'CONFIRMED';
        }
        await client.query('ROLLBACK');
        return result.status;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return 'ERROR';
      } finally {
        client.release();
      }
    })
  );

  const confirmed = results.filter((r) => r === 'CONFIRMED').length;
  const full = results.filter((r) => r === 'FULL').length;

  const slotRow = await pool.query(
    `SELECT booked_count FROM venue_time_slots WHERE partner_id = $1 AND slot_datetime = $2`,
    [partnerId, slotDt]
  );
  const bookedCount = slotRow.rows[0] ? slotRow.rows[0].booked_count : null;

  log(`Results: ${confirmed} CONFIRMED, ${full} FULL, booked_count=${bookedCount}`);
  if (confirmed <= 5 && bookedCount === 5) {
    log('✅ Concurrency test PASS: no overbooking (max 5 confirmed, booked_count=5)');
  } else {
    log(`⚠️  Concurrency check: expected confirmed<=5 and booked_count=5, got confirmed=${confirmed} booked_count=${bookedCount}`);
  }

  const promo = await waitlistService.runPromotionCycle();
  log(`Promotion cycle: notified=${promo.notified}, slots_checked=${promo.slots_checked}`);

  log('--- Load test done ---');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
