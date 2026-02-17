#!/usr/bin/env node
/**
 * Test the booking waitlist feature end-to-end.
 * Run from backend: node scripts/test-waitlist.js
 * Uses DB from env; requires booking_waitlist table (run 2026-02-operating-hours-waitlist.sql).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getPool } = require('../src/config/db');
const waitlistService = require('../src/services/waitlistService');
const operatingHoursService = require('../src/services/operatingHoursService');
const { log } = require('../src/utils/logger');

const pool = getPool();

function toYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getWaitlistTableExists() {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_waitlist'`
  );
  return r.rows.length > 0;
}

async function getPartnerWithHours() {
  const r = await pool.query(
    `SELECT p.id AS partner_id
     FROM partners p
     INNER JOIN partner_hours ph ON ph.partner_id = p.id
     WHERE p.is_active = true
       AND (p.status IS NULL OR p.status IN ('active', 'approved'))
       AND ph.is_closed = false
       AND ph.opens_at IS NOT NULL
       AND ph.closes_at IS NOT NULL
     LIMIT 1`
  );
  return r.rows[0]?.partner_id || null;
}

async function getFirstUserId() {
  const r = await pool.query(`SELECT id FROM users ORDER BY created_at LIMIT 1`);
  return r.rows[0]?.id || null;
}

async function findValidSlot(partnerId) {
  const times = ['12:00', '13:00', '19:00', '20:00'];
  for (let daysAhead = 1; daysAhead <= 14; daysAhead++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    const bookingDate = toYYYYMMDD(d);
    for (const time of times) {
      try {
        const v = await operatingHoursService.validateBookingTime(partnerId, bookingDate, time);
        if (v.valid) return { bookingDate, bookingTime: time };
      } catch (e) {
        // skip this slot
      }
    }
  }
  return null;
}

async function main() {
  log('--- Waitlist feature test ---');

  const tableExists = await getWaitlistTableExists();
  if (!tableExists) {
    log('SKIP: booking_waitlist table not found. Run migration: db/migrations/2026-02-operating-hours-waitlist.sql');
    process.exit(1);
  }
  log('OK: booking_waitlist table exists');

  const partnerId = await getPartnerWithHours();
  if (!partnerId) {
    log('SKIP: No partner with operating hours found. Add partner_hours for at least one partner.');
    process.exit(1);
  }
  log('OK: Using partner_id:', partnerId);

  const userId = await getFirstUserId();
  if (!userId) {
    log('SKIP: No users in DB.');
    process.exit(1);
  }
  log('OK: Using user_id:', userId);

  const slot = await findValidSlot(partnerId);
  if (!slot) {
    log('SKIP: No valid (date, time) slot within next 14 days for this partner.');
    process.exit(1);
  }
  log('OK: Valid slot:', slot.bookingDate, slot.bookingTime);

  // 1. Join waitlist
  log('\n1. Joining waitlist...');
  const joinResult = await waitlistService.joinWaitlist({
    partner_id: partnerId,
    user_id: userId,
    booking_date: slot.bookingDate,
    booking_time: slot.bookingTime,
    party_size: 2,
    user_tier: 'Ather',
    special_requests: 'Test waitlist entry'
  });

  if (!joinResult.success) {
    log('Join result:', joinResult.message);
    if (joinResult.waitlist_entry) log('(Already on waitlist at position', joinResult.waitlist_entry.position, ')');
  } else {
    log('Joined:', joinResult.message, '| position:', joinResult.waitlist_entry?.position, '| estimated wait (min):', joinResult.estimated_wait_minutes);
  }

  // 2. Get user's waitlist entries (all statuses so we see waiting + notified)
  log('\n2. Getting user waitlist entries...');
  const entries = await waitlistService.getUserWaitlistEntries(userId, null);
  log('Entries (all):', Array.isArray(entries) ? entries.length : 0);
  if (Array.isArray(entries) && entries.length > 0) {
    entries.forEach((e, i) => {
      log(`   [${i + 1}] partner=${e.partner_id}, ${e.booking_date} ${e.booking_time}, position=${e.position}, status=${e.status}`);
    });
  }

  // 3. Partner: get waitlist for slot
  log('\n3. Partner: get waitlist for slot...');
  const partnerList = await waitlistService.getWaitlistForSlot(
    partnerId,
    slot.bookingDate,
    slot.bookingTime,
    'waiting'
  );
  log('Waitlist for slot:', Array.isArray(partnerList) ? partnerList.length : 0, 'entries');
  if (Array.isArray(partnerList) && partnerList.length > 0) {
    partnerList.forEach((e, i) => {
      log(`   [${i + 1}] user_id=${e.user_id}, position=${e.position}`);
    });
  }

  // 4. Partner: notify next
  log('\n4. Partner: notify next in waitlist...');
  const notified = await waitlistService.notifyNextInWaitlist(partnerId, slot.bookingDate, slot.bookingTime);
  if (notified) {
    log('Notified:', notified.user_id, '| status:', notified.status, '| expires_at:', notified.expires_at);
  } else {
    log('No one to notify (or list empty).');
  }

  // 5. Stats
  log('\n5. Waitlist stats for partner...');
  const dateTo = slot.bookingDate;
  const stats = await waitlistService.getWaitlistStats(partnerId, slot.bookingDate, dateTo);
  log('Stats:', JSON.stringify(stats, null, 2));

  log('\n--- Waitlist test done ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Waitlist test failed:', err.message || err);
  process.exit(1);
});
