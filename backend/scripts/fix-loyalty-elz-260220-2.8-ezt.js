/**
 * Correct loyalty for ELZ-260220-AJ2S: formula is (fiat × tier%)/1000, so 1% of ₹2800 = 2.8 EZT.
 * Reverses the 28 EZT previously credited and credits 2.8 EZT.
 * Run once: node scripts/fix-loyalty-elz-260220-2.8-ezt.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const BOOKING_REF = 'ELZ-260220-AJ2S';
const BOOKING_ID = '865eccfd-1029-4a18-ae97-42ec73e9b020';
const USER_ID = 'cf3eca00-2ce6-47e3-9bed-018d1f538f5c';
const FIAT_PAID = 2800;
const WRONG_EZT = 28;
const CORRECT_EZT = 2.8;

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const tokenService = require(path.join(backendRoot, 'src/services/tokenService'));
  const bookingRepository = require(path.join(backendRoot, 'src/repositories/bookingRepository'));
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const r = await client.query(
      'SELECT available_tokens FROM users WHERE id = $1 FOR UPDATE',
      [USER_ID]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    const balanceBefore = parseFloat(r.rows[0].available_tokens || 0);

    // 1) Reverse the 28 EZT: deduct from balance and total_tokens_earned
    await client.query(
      `UPDATE users SET available_tokens = available_tokens - $1, total_tokens_earned = total_tokens_earned - $1 WHERE id = $2`,
      [WRONG_EZT, USER_ID]
    );
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, NULL, $2, $3, 'spent', $4, $5, $6)`,
      [USER_ID, BOOKING_ID + '_reversal_28', WRONG_EZT, balanceBefore, balanceBefore - WRONG_EZT, 'Reversal: loyalty was 28 EZT; correct is 2.8 EZT (1% of fiat ₹2800) - ' + BOOKING_REF]
    );

    // 2) Credit correct loyalty: 2.8 EZT (1% of ₹2800 = fiat × 1 / 1000)
    const afterReversal = balanceBefore - WRONG_EZT;
    await client.query(
      `UPDATE users SET available_tokens = available_tokens + $1, total_tokens_earned = total_tokens_earned + $1 WHERE id = $2`,
      [CORRECT_EZT, USER_ID]
    );
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, NULL, $2, $3, 'earned', $4, $5, $6)`,
      [USER_ID, BOOKING_ID + '_loyalty_2.8', CORRECT_EZT, afterReversal, afterReversal + CORRECT_EZT, `Earned from voucher redemption (Fiat paid: ₹${FIAT_PAID})`]
    );

    await bookingRepository.updateBookingTierInfo(BOOKING_ID, {
      ezt_earned: CORRECT_EZT,
      ezt_reward_percentage: 1,
      user_tier_at_booking: 'Ather'
    }, client);

    await client.query('COMMIT');
    console.log('Done. Reversed 28 EZT and credited 2.8 EZT for booking', BOOKING_REF, '(1% of fiat ₹2800).');
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
