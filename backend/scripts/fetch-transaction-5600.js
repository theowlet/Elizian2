/**
 * Fetch all details for the transaction with total_bill_amount = 5600 (or amount 5600).
 * Run from backend: node scripts/fetch-transaction-5600.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();

  // Find redemption(s) where total_bill_amount is 5600 (or close for float)
  const redemptions = await pool.query(
    `SELECT
       ra.id AS redemption_id,
       ra.booking_id,
       ra.voucher_code,
       ra.redeemed_by_partner_id,
       ra.redeemed_at,
       ra.redemption_status,
       ra.total_bill_amount,
       ra.ezt_co_pay_amount,
       ra.net_amount_from_user,
       ra.redemption_notes,
       ra.settlement_status,
       ra.created_at AS redemption_created_at,
       b.booking_reference,
       b.user_id AS customer_user_id,
       b.partner_id,
       b.deal_id,
       b.status AS booking_status,
       b.ezt_earned AS booking_ezt_earned,
       b.ezt_reward_percentage AS booking_ezt_reward_pct,
       b.user_tier_at_booking,
       p.name AS partner_name,
       u_cust.email AS customer_email,
       u_cust.first_name AS customer_first_name,
       u_cust.last_name AS customer_last_name,
       u_cust.phone_number AS customer_phone
     FROM redemption_audit ra
     JOIN bookings b ON b.id = ra.booking_id
     LEFT JOIN partners p ON p.id = ra.redeemed_by_partner_id
     LEFT JOIN users u_cust ON u_cust.id = b.user_id
     WHERE CAST(ra.total_bill_amount AS DECIMAL) = 5600
        OR CAST(ra.net_amount_from_user AS DECIMAL) = 5600
        OR (ra.total_bill_amount >= 5599.5 AND ra.total_bill_amount <= 5600.5)
     ORDER BY ra.redeemed_at DESC`
  );

  if (redemptions.rows.length === 0) {
    console.log('No redemption found with total_bill_amount or net_amount_from_user = 5600.');
    return;
  }

  for (const r of redemptions.rows) {
    console.log('\n========== REDEMPTION ==========');
    console.log(JSON.stringify(r, null, 2));

    // Token ledger entries for this booking (earned + spent)
    const ledger = await pool.query(
      `SELECT id, user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description, created_at
       FROM token_ledger
       WHERE reference_id = $1 OR (reference_id LIKE $2 AND ledger_type = 'earned')
       ORDER BY created_at ASC`,
      [r.booking_id, r.booking_id + '%']
    );
    console.log('\n--- Token ledger (earned/spent for this booking) ---');
    console.log(JSON.stringify(ledger.rows, null, 2));

    // Loyalty EZT that should apply: (fiat_paid * tier%) / 100
    const fiatPaid = parseFloat(r.net_amount_from_user) || 0;
    const totalBill = parseFloat(r.total_bill_amount) || 0;
    const eztCoPay = parseFloat(r.ezt_co_pay_amount) || 0;
    const tierPct = parseFloat(r.booking_ezt_reward_pct) || 1;
    const expectedEztEarned = (fiatPaid * tierPct) / 100;
    console.log('\n--- Summary ---');
    console.log('Total bill (INR):', totalBill);
    console.log('EZT co-pay (INR):', eztCoPay);
    console.log('Net from user / Fiat paid (INR):', fiatPaid);
    console.log('Tier at booking:', r.user_tier_at_booking, '(' + tierPct + '%)');
    console.log('Expected loyalty EZT (fiat_paid * tier% / 100):', expectedEztEarned.toFixed(5));
    console.log('Booking ezt_earned stored:', r.booking_ezt_earned);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
