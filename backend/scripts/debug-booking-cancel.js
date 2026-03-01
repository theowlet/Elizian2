#!/usr/bin/env node
/**
 * Debug script for booking cancellation.
 * Usage: node scripts/debug-booking-cancel.js [booking_id_or_reference]
 * If no arg: lists recent bookings with status.
 * If arg: shows booking details and attempts cancel (dry-run by default).
 */

require('dotenv').config();
const { getPool } = require('../src/config/db');

async function main() {
  const pool = getPool();
  const arg = process.argv[2];

  if (!arg) {
    // List recent bookings
    const r = await pool.query(`
      SELECT b.id, b.booking_reference, b.status, b.user_id, b.created_at,
             po.title AS deal_title, p.name AS partner_name
      FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN partners p ON b.partner_id = p.id
      ORDER BY b.created_at DESC
      LIMIT 15
    `);
    console.log('\n--- Recent bookings ---');
    console.table(r.rows.map((row) => ({
      id: row.id?.toString().slice(0, 8) + '...',
      ref: row.booking_reference,
      status: row.status,
      deal: (row.deal_title || '').slice(0, 25),
      partner: (row.partner_name || '').slice(0, 20),
    })));
    console.log('\nCancelled count:', r.rows.filter((x) => x.status === 'cancelled').length);
    return;
  }

  // Look up by id or booking_reference
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);
  const lookup = isUuid
    ? await pool.query('SELECT * FROM bookings WHERE id = $1', [arg])
    : await pool.query('SELECT * FROM bookings WHERE booking_reference = $1', [arg]);

  if (lookup.rows.length === 0) {
    console.log('Booking not found:', arg);
    return;
  }

  const b = lookup.rows[0];
  console.log('\n--- Booking details ---');
  console.log('id:', b.id);
  console.log('booking_reference:', b.booking_reference);
  console.log('status:', b.status);
  console.log('user_id:', b.user_id);
  console.log('cancelled_at:', b.cancelled_at);
  console.log('cancellation_reason:', b.cancellation_reason);

  if (process.argv.includes('--cancel')) {
    const bookingService = require('../src/services/bookingService');
    const userId = b.user_id;
    try {
      const updated = await bookingService.cancelBooking(b.id, userId);
      console.log('\n✅ Cancel succeeded:', updated?.status);
    } catch (err) {
      console.error('\n❌ Cancel failed:', err.message);
    }
  } else {
    console.log('\nTo actually cancel, run: node scripts/debug-booking-cancel.js', arg, '--cancel');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
