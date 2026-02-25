/**
 * Backfill missing or short loyalty EZT credits for past redemptions.
 * 0) Bookings with redemption but ezt_earned never set → compute from bill + tier, update booking, credit.
 * 1) Bookings with ezt_earned > 0 and NO token_ledger 'earned' row → full credit.
 * 2) Bookings where the existing 'earned' row has amount << ezt_earned (old bug) → credit the shortfall.
 * Run: node scripts/backfill-loyalty-ezt-credits.js
 * Diagnose: node scripts/backfill-loyalty-ezt-credits.js --diagnose
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const MIN_SHORTFALL = 0.001; // treat as shortfall if ledger amount is this much less than ezt_earned
const isDiagnose = process.argv.includes('--diagnose');

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const tokenService = require(path.join(backendRoot, 'src/services/tokenService'));
  const tierRepository = require(path.join(backendRoot, 'src/repositories/tierRepository'));
  const bookingRepository = require(path.join(backendRoot, 'src/repositories/bookingRepository'));
  const pool = getPool();

  if (isDiagnose) {
    const redeemedWithEzt = await pool.query(
      `SELECT COUNT(*) AS c FROM bookings WHERE status = 'redeemed' AND ezt_earned IS NOT NULL AND CAST(ezt_earned AS DECIMAL) > 0`
    );
    const withAudit = await pool.query(
      `SELECT COUNT(*) AS c FROM bookings b
       INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
       WHERE b.status = 'redeemed' AND b.ezt_earned IS NOT NULL AND CAST(b.ezt_earned AS DECIMAL) > 0`
    );
    const missingLedger = await pool.query(
      `SELECT COUNT(*) AS c FROM bookings b
       INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
       WHERE b.status = 'redeemed' AND b.ezt_earned IS NOT NULL AND CAST(b.ezt_earned AS DECIMAL) > 0
         AND NOT EXISTS (SELECT 1 FROM token_ledger tl WHERE tl.user_id = b.user_id AND tl.reference_id = b.id::text AND tl.ledger_type = 'earned')`
    );
    const earnedWithNullRef = await pool.query(
      `SELECT COUNT(*) AS c FROM token_ledger WHERE ledger_type = 'earned' AND (reference_id IS NULL OR reference_id = '')`
    );
    const redeemedNoEzt = await pool.query(
      `SELECT COUNT(*) AS c FROM bookings b
       INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
       WHERE b.status = 'redeemed' AND (CAST(ra.total_bill_amount AS DECIMAL) > 0)
         AND (b.ezt_earned IS NULL OR CAST(b.ezt_earned AS DECIMAL) <= 0)`
    );
    console.log('Redeemed with bill > 0 but ezt_earned null/0 (will backfill in phase 0):', redeemedNoEzt.rows[0].c);
    const sampleBookings = await pool.query(
      `SELECT b.id, b.booking_reference, b.user_id, b.ezt_earned, ra.redemption_status
       FROM bookings b
       INNER JOIN redemption_audit ra ON ra.booking_id = b.id
       WHERE b.status = 'redeemed' AND b.ezt_earned IS NOT NULL AND CAST(b.ezt_earned AS DECIMAL) > 0
       ORDER BY b.created_at DESC LIMIT 5`
    );
    console.log('--- Diagnose: loyalty EZT backfill ---');
    console.log('Bookings (redeemed, ezt_earned > 0):', redeemedWithEzt.rows[0].c);
    console.log('  with redemption_audit (redeemed/disputed):', withAudit.rows[0].c);
    console.log('  missing token_ledger earned (reference_id=booking.id):', missingLedger.rows[0].c);
    console.log("token_ledger 'earned' rows with null/empty reference_id:", earnedWithNullRef.rows[0].c);
    console.log('Sample redeemed bookings:', JSON.stringify(sampleBookings.rows, null, 2));
    const sampleLedger = await pool.query(
      `SELECT tl.id, tl.user_id, tl.reference_id, tl.amount, tl.ledger_type, tl.description, tl.created_at
       FROM token_ledger tl WHERE tl.ledger_type = 'earned' ORDER BY tl.created_at DESC LIMIT 5`
    );
    console.log('Sample token_ledger earned rows:', JSON.stringify(sampleLedger.rows, null, 2));
    return;
  }

  // 0) Phase 0: redeemed with fiat paid but ezt_earned never set — compute from tier on net (fiat) amount, update booking, credit
  const noEztSet = await pool.query(
    `SELECT b.id AS booking_id, b.user_id, b.booking_reference, ra.total_bill_amount, ra.net_amount_from_user
     FROM bookings b
     INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
     WHERE b.status = 'redeemed'
       AND (CAST(ra.net_amount_from_user AS DECIMAL) > 0)
       AND (b.ezt_earned IS NULL OR CAST(b.ezt_earned AS DECIMAL) <= 0)
       AND NOT EXISTS (SELECT 1 FROM token_ledger tl WHERE tl.user_id = b.user_id AND tl.reference_id = b.id::text AND tl.ledger_type = 'earned')
     ORDER BY b.created_at ASC`
  );

  let phase0Credited = 0;
  for (const r of noEztSet.rows) {
    const fiatPaid = parseFloat(r.net_amount_from_user) || 0;
    if (fiatPaid <= 0) continue;
    const tierResult = await tierRepository.calculateEZTReward(r.user_id, fiatPaid);
    const eztEarned = tierResult.eztAmount || 0;
    if (eztEarned <= 0) continue;
    const eztRounded = parseFloat(eztEarned.toFixed(5));
    await bookingRepository.updateBookingTierInfo(r.booking_id, {
      ezt_earned: eztRounded,
      ezt_reward_percentage: tierResult.percentage,
      user_tier_at_booking: tierResult.tierName
    }, pool);
    const desc = `Earned from voucher redemption (Fiat paid: ₹${fiatPaid}) [backfill]`;
    const out = await tokenService.creditEarned(r.user_id, eztRounded, String(r.booking_id), desc, null);
    if (out > 0) {
      phase0Credited++;
      console.log(`  [phase0] Credited ${eztRounded} EZT to user ${r.user_id} (booking ${r.booking_reference}, fiat paid ₹${fiatPaid})`);
    }
  }
  if (phase0Credited > 0) console.log(`Phase 0: credited ${phase0Credited} booking(s) that had no ezt_earned set.`);

  // 1) Missing: no earned row for this booking — compute from fiat (net_amount_from_user), not from booking.ezt_earned or total bill
  const missing = await pool.query(
    `SELECT b.id AS booking_id, b.user_id, b.booking_reference, b.ezt_earned,
            ra.total_bill_amount, ra.ezt_co_pay_amount, ra.net_amount_from_user
     FROM bookings b
     INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
     WHERE b.status = 'redeemed'
       AND (CAST(ra.net_amount_from_user AS DECIMAL) > 0)
       AND NOT EXISTS (
         SELECT 1 FROM token_ledger tl
         WHERE tl.user_id = b.user_id AND tl.reference_id = b.id::text AND tl.ledger_type = 'earned'
       )
     ORDER BY b.created_at ASC`
  );

  // 2) Shortfall: earned row exists but amount is way less than expected (expected = from fiat paid)
  const shortfall = await pool.query(
    `SELECT b.id AS booking_id, b.user_id, b.booking_reference, b.ezt_earned,
            ra.total_bill_amount, ra.net_amount_from_user, tl.amount AS ledger_amount
     FROM bookings b
     INNER JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status IN ('redeemed', 'disputed')
     INNER JOIN token_ledger tl ON tl.user_id = b.user_id AND tl.reference_id = b.id::text AND tl.ledger_type = 'earned'
     WHERE b.status = 'redeemed'
       AND (CAST(ra.net_amount_from_user AS DECIMAL) > 0)
     ORDER BY b.created_at ASC`
  );

  const total = missing.rows.length + shortfall.rows.length;
  if (total === 0) {
    console.log('No bookings missing or short on loyalty EZT credit. Nothing to backfill.');
    return;
  }
  console.log(`Found ${missing.rows.length} booking(s) missing loyalty credit, ${shortfall.rows.length} to check for shortfall. Crediting now...`);

  let credited = 0;

  for (const r of missing.rows) {
    const fiatPaid = parseFloat(r.net_amount_from_user) || 0;
    if (fiatPaid <= 0) continue;
    const tierResult = await tierRepository.calculateEZTReward(r.user_id, fiatPaid);
    const ezt = tierResult.eztAmount || 0;
    if (ezt <= 0) continue;
    const eztRounded = parseFloat(parseFloat(ezt).toFixed(5));
    const desc = `Earned from voucher redemption (Fiat paid: ₹${fiatPaid}) [backfill]`;
    const out = await tokenService.creditEarned(r.user_id, eztRounded, String(r.booking_id), desc, null);
    if (out > 0) {
      credited++;
      await bookingRepository.updateBookingTierInfo(r.booking_id, {
        ezt_earned: eztRounded,
        ezt_reward_percentage: tierResult.percentage,
        user_tier_at_booking: tierResult.tierName
      }, pool);
      console.log(`  [missing] Credited ${eztRounded} EZT to user ${r.user_id} (booking ${r.booking_reference}, fiat paid ₹${fiatPaid})`);
    }
  }

  for (const r of shortfall.rows) {
    const fiatPaid = parseFloat(r.net_amount_from_user) || 0;
    if (fiatPaid <= 0) continue;
    const tierResult = await tierRepository.calculateEZTReward(r.user_id, fiatPaid);
    const expected = tierResult.eztAmount || 0;
    const existing = parseFloat(r.ledger_amount) || 0;
    const topUp = parseFloat((expected - existing).toFixed(5));
    if (topUp < MIN_SHORTFALL) continue;
    const refId = `${r.booking_id}_correction`;
    const desc = `Loyalty correction (Fiat paid: ₹${fiatPaid}) [backfill]`;
    const out = await tokenService.creditEarned(r.user_id, topUp, refId, desc, null);
    if (out > 0) {
      credited++;
      console.log(`  [shortfall] Credited ${topUp} EZT to user ${r.user_id} (booking ${r.booking_reference}, fiat ₹${fiatPaid}, had ${existing})`);
    }
  }

  console.log(`Done. Credited ${credited} loyalty EZT entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
