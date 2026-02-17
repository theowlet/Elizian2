/**
 * Test script for redemption auto-calculation (co-pay offer from deal).
 * Run from backend: node scripts/test-redemption-calculation.js
 *
 * Tests:
 * 1. Pure math: 20% offer, bill 2000 → discount 400, ezt 4, net 1600
 * 2. Pure math: 25% offer, bill 1000 → discount 250, ezt 2.5, net 750
 * 3. If DB available: fetch one partner_offer and run calculateRedemptionBreakdown
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const {
  getOfferDiscount,
  calculateRedemptionAmounts,
  calculateRedemptionBreakdown,
  EZT_TO_INR,
} = require(path.join(backendRoot, 'src/services/redemptionCalculationService'));

function runPureTests() {
  console.log('--- Pure calculation tests (no DB) ---\n');

  // 20% offer, bill 2000
  const offer20 = { co_pay_percentage: 20, offer_type: 'co_pay' };
  const r1 = calculateRedemptionAmounts(null, 2000, offer20);
  console.log('Offer 20%, Bill ₹2000:');
  console.log('  discount_amount:', r1.discount_amount, '(expected 400)');
  console.log('  ezt_tokens_required:', r1.ezt_tokens_required, '(expected 4)');
  console.log('  net_amount_from_user:', r1.net_amount_from_user, '(expected 1600)');
  const ok1 = r1.discount_amount === 400 && r1.ezt_tokens_required === 4 && r1.net_amount_from_user === 1600;
  console.log('  ', ok1 ? '✓ PASS' : '✗ FAIL');
  console.log('');

  // 25% offer, bill 1000
  const offer25 = { co_pay_percentage: 25, offer_type: 'co_pay' };
  const r2 = calculateRedemptionAmounts(null, 1000, offer25);
  console.log('Offer 25%, Bill ₹1000:');
  console.log('  discount_amount:', r2.discount_amount, '(expected 250)');
  console.log('  ezt_tokens_required:', r2.ezt_tokens_required, '(expected 2.5)');
  console.log('  net_amount_from_user:', r2.net_amount_from_user, '(expected 750)');
  const ok2 = r2.discount_amount === 250 && r2.ezt_tokens_required === 2.5 && r2.net_amount_from_user === 750;
  console.log('  ', ok2 ? '✓ PASS' : '✗ FAIL');
  console.log('');

  // EZT_TO_INR
  console.log('EZT_TO_INR:', EZT_TO_INR, '(expected 100)');
  console.log('  ', EZT_TO_INR === 100 ? '✓ PASS' : '✗ FAIL');
  console.log('');

  return ok1 && ok2;
}

async function runDbTest() {
  console.log('--- DB test (calculateRedemptionBreakdown) ---\n');
  let pool;
  try {
    const { getPool } = require(path.join(backendRoot, 'src/config/db'));
    pool = getPool();
    const offerRow = await pool.query(
      'SELECT id, co_pay_percentage, offer_type FROM partner_offers WHERE co_pay_percentage IS NOT NULL LIMIT 1'
    );
    if (offerRow.rows.length === 0) {
      console.log('No partner_offers with co_pay_percentage found. Skip DB test.');
      return true;
    }
    const offer = offerRow.rows[0];
    const offerId = offer.id;
    const pct = parseFloat(offer.co_pay_percentage) || 0;
    console.log('Using offer id:', offerId, 'co_pay_percentage:', pct);
    const totalBill = 2000;
    const breakdown = await calculateRedemptionBreakdown(offerId, totalBill, null);
    console.log('Bill ₹2000 breakdown:', JSON.stringify(breakdown, null, 2));
    const expectedDiscount = Math.round(totalBill * (pct / 100) * 100) / 100;
    const expectedNet = Math.round((totalBill - expectedDiscount) * 100) / 100;
    const ok = breakdown.discount_amount === expectedDiscount && breakdown.net_amount_from_user === expectedNet;
    console.log('  ', ok ? '✓ PASS' : '✗ FAIL (check rounding)');
    return ok;
  } catch (err) {
    console.error('DB test error:', err.message);
    return false;
  }
}

(async () => {
  const pureOk = runPureTests();
  const dbOk = await runDbTest();
  console.log('\n--- Summary ---');
  console.log('Pure tests:', pureOk ? 'PASS' : 'FAIL');
  console.log('DB test:', dbOk ? 'PASS' : 'FAIL or SKIP');
  process.exit(pureOk && dbOk ? 0 : 1);
})();
