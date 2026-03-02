#!/usr/bin/env node
/**
 * Verify if specific bookings appear in Partner Console
 * Usage: node scripts/verify-partner-console-bookings.js ELZ-46DZZLZD ELZ-FS4MAM2F
 * Or: node scripts/verify-partner-console-bookings.js  (uses default refs from Ram Navmi screenshot)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

const refs = process.argv.slice(2).length ? process.argv.slice(2) : ['ELZ-46DZZLZD', 'ELZ-FS4MAM2F'];

async function run() {
  const pool = getPool();
  try {
    console.log('Checking bookings:', refs.join(', '));
    console.log('');

    for (const ref of refs) {
      const r = await pool.query(
        `SELECT b.id, b.booking_reference, b.deal_id, b.partner_id, b.status, b.booking_date, b.booking_time,
                po.title as deal_title, po.partner_id as offer_partner_id,
                p.name as partner_name
         FROM bookings b
         LEFT JOIN partner_offers po ON b.deal_id = po.id
         LEFT JOIN partners p ON COALESCE(po.partner_id, b.partner_id) = p.id
         WHERE b.booking_reference = $1`,
        [ref]
      );

      if (r.rows.length === 0) {
        console.log(`❌ ${ref}: NOT FOUND in database`);
        continue;
      }

      const b = r.rows[0];
      const partnerId = b.offer_partner_id || b.partner_id;
      const partnerName = b.partner_name || '(unknown)';

      // Simulate listPartnerBookings WHERE: (po.partner_id = $1 OR (b.partner_id = $1 AND (b.deal_id IS NULL OR po.id IS NULL)))
      const wouldShow = partnerId != null && (
        (b.offer_partner_id && b.offer_partner_id === partnerId) ||
        (b.partner_id && b.partner_id === partnerId && (!b.deal_id || !b.offer_partner_id))
      );

      console.log(`--- ${ref} ---`);
      console.log(`  Deal: ${b.deal_title || 'N/A'}`);
      console.log(`  Venue: ${partnerName}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Date: ${b.booking_date} ${b.booking_time || ''}`);
      console.log(`  Partner ID (for console): ${partnerId || 'NULL'}`);
      console.log(`  In Partner Console: ${wouldShow ? '✓ YES' : '✗ NO'}`);
      console.log('');
    }

    // Summary: both should show for Zyxx partner
    const partnerId = (await pool.query(
      `SELECT id FROM partners WHERE LOWER(name) LIKE '%zyxx%' LIMIT 1`
    )).rows[0]?.id;

    if (partnerId) {
      const count = await pool.query(
        `SELECT COUNT(*) FROM bookings b
         LEFT JOIN partner_offers po ON b.deal_id = po.id
         WHERE (po.partner_id = $1 OR (b.partner_id = $1 AND (b.deal_id IS NULL OR po.id IS NULL)))
         AND b.booking_reference = ANY($2::text[])`,
        [partnerId, refs]
      );
      console.log(`--- Summary ---`);
      console.log(`  Partner "Zyxx" (${partnerId}) should show ${count.rows[0].count} of ${refs.length} booking(s) in Partner Console`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
