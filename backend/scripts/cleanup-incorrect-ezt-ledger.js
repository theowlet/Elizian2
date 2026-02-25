/**
 * Remove incorrect and reversal EZT ledger entries; recompute user balance and total_tokens_earned.
 * Correct loyalty formula: (fiat_spent × tier_pct) / 1000. Keep only correct transactions.
 *
 * Removes:
 * - All reversal entries (description contains "Reversal" or reference_id like '%_reversal_%')
 * - Earned entries from wrong backfill (description contains "[backfill]" and "Bill:" - was on bill, wrong formula)
 * - Wrong correction: "Loyalty correction: earned on fiat paid" (the 27.44 entry)
 * - Wrong 28 EZT credit for ELZ-260220 (should be 2.8): "Fiat paid: ₹2800" with amount 28
 * - Original wrong backfill for ELZ-260220: reference_id = booking_id, amount 0.56
 *
 * Then recomputes users.available_tokens and total_tokens_earned from remaining ledger.
 * Run once: node scripts/cleanup-incorrect-ezt-ledger.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1) Find and delete incorrect/reversal rows (all users)
    const toDelete = await client.query(
      `SELECT id, user_id, ledger_type, amount, reference_id, description
       FROM token_ledger
       WHERE
         (description ILIKE '%Reversal%')
         OR (reference_id IS NOT NULL AND reference_id LIKE '%_reversal_%')
         OR (reference_id IS NOT NULL AND reference_id LIKE '%_fiat_correction')
         OR (reference_id IS NOT NULL AND reference_id LIKE '%_loyalty_final')
         OR (ledger_type = 'earned' AND description LIKE '%[backfill]%' AND description LIKE '%Bill:%')
         OR (ledger_type = 'earned' AND description LIKE '%Loyalty correction: earned on fiat paid%')
         OR (ledger_type = 'earned' AND description LIKE '%Earned from voucher redemption (Fiat paid: ₹2800)%' AND CAST(amount AS DECIMAL) = 28)
         OR (ledger_type = 'earned' AND reference_id = '865eccfd-1029-4a18-ae97-42ec73e9b020' AND CAST(amount AS DECIMAL) = 0.56)
       ORDER BY user_id, created_at`
    );

    const userIds = [...new Set(toDelete.rows.map((r) => r.user_id))];
    console.log('Rows to remove:', toDelete.rows.length);
    toDelete.rows.forEach((r) => {
      console.log('  ', r.ledger_type, r.amount, r.reference_id || '', (r.description || '').slice(0, 60));
    });

    if (toDelete.rows.length === 0) {
      console.log('Nothing to remove.');
      await client.query('COMMIT');
      return;
    }

    const ids = toDelete.rows.map((r) => r.id);
    await client.query(
      `DELETE FROM token_ledger WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    console.log('Deleted', ids.length, 'rows.');

    // 2) Recompute available_tokens and total_tokens_earned for each affected user
    for (const userId of userIds) {
      const sums = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN ledger_type IN ('earned', 'airdrop', 'bonus') THEN amount ELSE 0 END), 0) AS total_credits,
           COALESCE(SUM(CASE WHEN ledger_type = 'spent' THEN amount ELSE 0 END), 0) AS total_debits,
           COALESCE(SUM(CASE WHEN ledger_type IN ('earned', 'airdrop', 'bonus') THEN amount ELSE 0 END), 0) AS total_earned
         FROM token_ledger WHERE user_id = $1`,
        [userId]
      );
      const credits = parseFloat(sums.rows[0].total_credits || 0);
      const debits = parseFloat(sums.rows[0].total_debits || 0);
      const totalEarned = parseFloat(sums.rows[0].total_earned || 0);
      const balance = parseFloat((credits - debits).toFixed(5));

      await client.query(
        `UPDATE users SET available_tokens = $1, total_tokens_earned = $2 WHERE id = $3`,
        [balance, totalEarned, userId]
      );
      console.log('User', userId, '-> balance', balance, ', total_tokens_earned', totalEarned);
    }

    await client.query('COMMIT');
    console.log('Cleanup done. Run backfill if needed: node scripts/backfill-loyalty-ezt-credits.js');
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
