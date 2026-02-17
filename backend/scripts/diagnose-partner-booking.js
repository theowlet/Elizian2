#!/usr/bin/env node
/**
 * Diagnose why a booking doesn't show in Partner Console
 * Usage: node scripts/diagnose-partner-booking.js <booking_id> [partner_id]
 * Example: node scripts/diagnose-partner-booking.js 65dc7f0a-b505-4715-b502-eba465a5031c 29faba66-cf2d-4c83-83f6-9171068639ed
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const bookingId = process.argv[2] || '65dc7f0a-b505-4715-b502-eba465a5031c';
const partnerId = process.argv[3] || '29faba66-cf2d-4c83-83f6-9171068639ed';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: false // Use same SSL config as backend; override via env if needed
});

async function run() {
  try {
    // Check if bookings table exists
    const tbl = await pool.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings')
    `);
    if (!tbl.rows[0].exists) {
      console.log('❌ Table "bookings" does not exist');
      process.exit(1);
    }

    // Get booking columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name IN ('deal_id', 'offer_id', 'partner_id', 'event_id')
      ORDER BY column_name
    `);
    console.log('Bookings columns:', cols.rows.map(r => r.column_name).join(', '));

    // Fetch the booking (offer_id may not exist in all schemas)
    let r;
    try {
      r = await pool.query(
        `SELECT id, deal_id, partner_id, event_id, status, booking_reference, created_at 
         FROM bookings WHERE id = $1`,
        [bookingId]
      );
    } catch (e) {
      if (/offer_id|column.*does not exist/i.test(e.message)) {
        r = await pool.query(
          `SELECT id, deal_id, partner_id, event_id, status, booking_reference, created_at 
           FROM bookings WHERE id = $1`,
          [bookingId]
        );
      } else throw e;
    }

    if (r.rows.length === 0) {
      console.log(`\n❌ Booking ${bookingId} NOT FOUND in database`);
      process.exit(1);
    }

    const b = r.rows[0];
    console.log('\n--- Booking ---');
    console.log(JSON.stringify({ id: b.id, deal_id: b.deal_id, offer_id: b.offer_id, partner_id: b.partner_id, event_id: b.event_id, status: b.status, booking_reference: b.booking_reference, created_at: b.created_at }, null, 2));

    const hasDealId = b.deal_id != null;
    const hasOfferId = b.offer_id != null;
    const hasPartnerId = b.partner_id != null;

    console.log('\n--- Analysis ---');
    if (hasPartnerId) {
      const matches = b.partner_id === partnerId;
      console.log(`partner_id ${matches ? '✓' : '✗'} matches partner ${partnerId}: ${matches}`);
    } else {
      console.log('partner_id: NULL (booking may predate partner_id column)');
    }

    if (hasDealId || hasOfferId) {
      const offerId = b.deal_id || b.offer_id;
      const po = await pool.query(
        `SELECT id, title, partner_id FROM partner_offers WHERE id = $1`,
        [offerId]
      );
      if (po.rows.length > 0) {
        const o = po.rows[0];
        const offerPartnerMatches = o.partner_id === partnerId;
        console.log(`Offer ${offerId}: title="${o.title}", partner_id=${o.partner_id}`);
        console.log(`Offer partner_id ${offerPartnerMatches ? '✓' : '✗'} matches: ${offerPartnerMatches}`);
      } else {
        console.log(`Offer ${offerId}: NOT FOUND (may have been deleted)`);
      }
    } else {
      console.log('deal_id/offer_id: NULL (event booking or legacy)');
    }

    // Simulate the listPartnerBookings WHERE clause
    let wouldShow = false;
    if (hasDealId || hasOfferId) {
      const offerId = b.deal_id || b.offer_id;
      const po = await pool.query(
        `SELECT partner_id FROM partner_offers WHERE id = $1`,
        [offerId]
      );
      if (po.rows.length > 0 && po.rows[0].partner_id === partnerId) wouldShow = true;
      else if (po.rows.length === 0 && hasPartnerId && b.partner_id === partnerId) wouldShow = true; // Offer deleted
    } else if (hasPartnerId && b.partner_id === partnerId) {
      wouldShow = true; // Event booking, no deal
    }

    console.log('\n--- Result ---');
    console.log(wouldShow ? '✓ Booking SHOULD appear in Partner Console' : '✗ Booking would NOT appear (partner/offer mismatch or missing partner_id)');
    if (!wouldShow && !hasPartnerId) {
      console.log('\nFix: Backfill partner_id on this booking from the related offer or event.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
