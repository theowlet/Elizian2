/**
 * One-off: Correct loyalty EZT for booking ELZ-260220-AJ2S (total bill ₹5600, fiat paid ₹2800).
 * Loyalty should be on fiat (2800 × 1% = 28 EZT); backfill had credited 0.56 EZT (wrong base). Credit shortfall 27.44 EZT.
 * Run once: node scripts/correct-loyalty-elz-260220-aj2s.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const BOOKING_REF = 'ELZ-260220-AJ2S';

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const tokenService = require(path.join(backendRoot, 'src/services/tokenService'));
  const tierRepository = require(path.join(backendRoot, 'src/repositories/tierRepository'));
  const bookingRepository = require(path.join(backendRoot, 'src/repositories/bookingRepository'));
  const pool = getPool();

  const row = await pool.query(
    `SELECT b.id AS booking_id, b.user_id, b.booking_reference, b.ezt_earned,
            ra.total_bill_amount, ra.net_amount_from_user
     FROM bookings b
     JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
     WHERE b.booking_reference = $1`,
    [BOOKING_REF]
  );

  if (row.rows.length === 0) {
    console.log('Booking not found:', BOOKING_REF);
    return;
  }

  const r = row.rows[0];
  const fiatPaid = parseFloat(r.net_amount_from_user) || 0;
  const tierResult = await tierRepository.calculateEZTReward(r.user_id, fiatPaid);
  const correctEzt = tierResult.eztAmount || 0;
  const existingEzt = parseFloat(r.ezt_earned) || 0;
  const shortfall = parseFloat((correctEzt - existingEzt).toFixed(5));

  console.log('Booking:', r.booking_reference);
  console.log('Fiat paid (INR):', fiatPaid);
  console.log('Correct loyalty EZT (fiat × tier% / 100):', correctEzt);
  console.log('Currently stored ezt_earned:', existingEzt);
  console.log('Shortfall to credit:', shortfall);

  if (shortfall < 0.00001) {
    console.log('No correction needed.');
    return;
  }

  const refId = `${r.booking_id}_fiat_correction`;
  const desc = `Loyalty correction: earned on fiat paid ₹${fiatPaid} (booking ${r.booking_reference})`;
  const out = await tokenService.creditEarned(r.user_id, shortfall, refId, desc, null);
  if (out > 0) {
    await bookingRepository.updateBookingTierInfo(r.booking_id, {
      ezt_earned: correctEzt,
      ezt_reward_percentage: tierResult.percentage,
      user_tier_at_booking: tierResult.tierName
    }, pool);
    console.log('Credited', shortfall, 'EZT. Booking ezt_earned updated to', correctEzt);
  } else {
    console.log('Credit skipped (idempotent or error).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
