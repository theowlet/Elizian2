#!/usr/bin/env node
/** Verify bookings table has all required columns */
const { getPool } = require('../src/config/db');

const REQUIRED = [
  'booking_reference', 'user_id', 'event_id', 'deal_id', 'partner_id', 'show_id',
  'booking_date', 'booking_time', 'status', 'total_price', 'fiat_amount', 'ezt_redeemed',
  'num_tickets', 'num_guests', 'special_requests', 'booking_type', 'reward_eligible',
  'voucher_code', 'qr_code_url', 'voucher_state', 'expires_at', 'user_tier_at_booking', 'is_priority_override'
];

async function main() {
  const pool = getPool();
  const r = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'bookings' AND table_schema = 'public'
  `);
  const cols = new Set(r.rows.map(x => x.column_name));
  const missing = REQUIRED.filter(c => !cols.has(c));
  if (missing.length) {
    console.error('❌ Missing columns:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ All', REQUIRED.length, 'required columns exist');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
