/**
 * Fix loyalty for booking ELZ-260220-AJ2S: correct amount is 28 EZT (1% of fiat ₹2800), not 0.56 + 27.44.
 * Reverses the two incorrect credits and posts one correct credit of 28 EZT.
 * Run once: node scripts/fix-loyalty-elz-260220-28-ezt.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const BOOKING_REF = 'ELZ-260220-AJ2S';
const BOOKING_ID = '865eccfd-1029-4a18-ae97-42ec73e9b020';
const USER_ID = 'cf3eca00-2ce6-47e3-9bed-018d1f538f5c';
const FIAT_PAID = 2800;
const CORRECT_EZT = 28;

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const r = await client.query(
      'SELECT available_tokens, total_tokens_earned FROM users WHERE id = $1 FOR UPDATE',
      [USER_ID]
    );
    if (r.rows.length === 0) {
      throw new Error('User not found');
    }
    const balanceBefore = parseFloat(r.rows[0].available_tokens || 0);
    const totalEarnedBefore = parseFloat(r.rows[0].total_tokens_earned || 0);

    // 1) Reverse the two incorrect credits: deduct 28 from balance and total_tokens_earned
    await client.query(
      `UPDATE users SET available_tokens = available_tokens - $1, total_tokens_earned = total_tokens_earned - $1 WHERE id = $2`,
      [CORRECT_EZT, USER_ID]
    );

    // 2) Insert two reversal ledger entries (spent = debit)
    const afterFirst = balanceBefore - 0.56;
    const afterSecond = balanceBefore - CORRECT_EZT;
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, NULL, $2, 0.56, 'spent', $3, $4, $5)`,
      [USER_ID, BOOKING_ID + '_reversal_backfill', balanceBefore, afterFirst, 'Reversal: incorrect loyalty (was on bill not fiat) - ' + BOOKING_REF]
    );
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, NULL, $2, 27.44, 'spent', $3, $4, $5)`,
      [USER_ID, BOOKING_ID + '_reversal_correction', afterFirst, afterSecond, 'Reversal: incorrect correction entry - ' + BOOKING_REF]
    );

    // 3) Credit the correct loyalty: 28 EZT (1% of fiat ₹2800)
    await client.query(
      `UPDATE users SET available_tokens = available_tokens + $1, total_tokens_earned = total_tokens_earned + $1 WHERE id = $2`,
      [CORRECT_EZT, USER_ID]
    );
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, NULL, $2, $3, 'earned', $4, $5, $6)`,
      [USER_ID, BOOKING_ID + '_loyalty_final', CORRECT_EZT, afterSecond, balanceBefore, `Earned from voucher redemption (Fiat paid: ₹${FIAT_PAID})`]
    );

    await client.query('COMMIT');
    console.log('Done. Reversed 0.56 + 27.44 and credited 28 EZT for booking', BOOKING_REF, '(fiat ₹2800, 1%).');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
