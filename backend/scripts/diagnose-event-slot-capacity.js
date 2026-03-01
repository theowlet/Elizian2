#!/usr/bin/env node
/**
 * Diagnose event slot capacity for a given offer.
 * Usage: node scripts/diagnose-event-slot-capacity.js <offer_id> [booking_date] [booking_time]
 * Example: node scripts/diagnose-event-slot-capacity.js <uuid> 2026-03-26 20:00
 */
require('dotenv').config();
const { getPool } = require('../src/config/db');
const eventSlotsRepository = require('../src/repositories/eventSlotsRepository');
const slotCapacityService = require('../src/services/slotCapacityService');

const pool = getPool();

async function main() {
  const offerId = process.argv[2];
  const bookingDate = process.argv[3] || new Date().toISOString().split('T')[0];
  const bookingTime = process.argv[4] || '20:00';

  if (!offerId) {
    console.error('Usage: node scripts/diagnose-event-slot-capacity.js <offer_id> [booking_date] [booking_time]');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log('\n=== Event Slot Capacity Diagnostic ===');
    console.log('Offer ID:', offerId);
    console.log('Booking date:', bookingDate);
    console.log('Booking time (raw):', bookingTime);
    console.log('Normalized time:', slotCapacityService.normalizeDealTimeSlot(bookingTime));

    // 1. Event slots
    const eventSlots = await eventSlotsRepository.listByOffer(offerId, client);
    console.log('\n--- event_slots ---');
    if (eventSlots.length === 0) {
      console.log('No event slots found. Check offer_id and event_slots table.');
    } else {
      eventSlots.forEach((s, i) => {
        console.log(`  [${i}] slot_time=${s.slot_time} capacity=${s.capacity} label=${s.label || '(none)'}`);
      });
    }

    // 2. getEffectiveEventSlotCapacity
    try {
      const cap = await slotCapacityService.getEffectiveEventSlotCapacity(offerId, bookingDate, bookingTime, client);
      console.log('\n--- getEffectiveEventSlotCapacity ---');
      console.log('  capacity:', cap.capacity);
      console.log('  timeSlot:', cap.timeSlot);
    } catch (err) {
      console.log('\n--- getEffectiveEventSlotCapacity ---');
      console.log('  ERROR:', err.message);
    }

    // 3. deal_slots rows for this offer/date
    const dealExists = await slotCapacityService.dealSlotsTableExists(client);
    console.log('\n--- deal_slots table ---');
    console.log('  exists:', dealExists);

    if (dealExists) {
      const rows = await client.query(
        `SELECT deal_id, date, time_slot, capacity, booked, is_available
         FROM deal_slots WHERE deal_id = $1 AND date = $2::date
         ORDER BY time_slot`,
        [offerId, bookingDate]
      );
      console.log('  rows for this offer/date:', rows.rows.length);
      rows.rows.forEach((r, i) => {
        console.log(`  [${i}] time_slot=${r.time_slot} capacity=${r.capacity} booked=${r.booked} available=${r.capacity - r.booked}`);
      });
    }

    // 4. getDealSlotCapacity
    const effectiveCap = eventSlots.find(s => {
      const st = String(s.slot_time || '').trim();
      const m = st.match(/(\d{1,2}):(\d{2})/);
      const slotHHMM = m ? `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}` : null;
      const norm = slotCapacityService.normalizeDealTimeSlot(bookingTime);
      return slotHHMM === norm;
    });
    const maxCap = effectiveCap ? effectiveCap.capacity : null;
    if (maxCap != null) {
      const dealCap = await slotCapacityService.getDealSlotCapacity(offerId, bookingDate, bookingTime, maxCap, client);
      console.log('\n--- getDealSlotCapacity ---');
      if (dealCap) {
        console.log('  capacity:', dealCap.capacity);
        console.log('  booked_count:', dealCap.booked_count);
        console.log('  availableCapacity:', dealCap.availableCapacity);
      } else {
        console.log('  (null - table missing or invalid params)');
      }
    }

    console.log('\n=== End ===\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
