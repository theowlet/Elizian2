/**
 * Remove duplicate 2.8 EZT earned for booking ELZ-260220 (backfill re-credited; we already have _loyalty_2.8 entry).
 * Run once: node scripts/remove-duplicate-elz-260220.js
 */
const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, user_id FROM token_ledger
     WHERE ledger_type = 'earned' AND reference_id = '865eccfd-1029-4a18-ae97-42ec73e9b020' AND description LIKE '%[backfill]%'`
  );
  if (r.rows.length === 0) {
    console.log('No duplicate found.');
    return;
  }
  await pool.query('DELETE FROM token_ledger WHERE id = $1', [r.rows[0].id]);
  const uid = r.rows[0].user_id;
  const s = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN ledger_type IN ('earned', 'airdrop', 'bonus') THEN amount ELSE 0 END), 0) AS c,
            COALESCE(SUM(CASE WHEN ledger_type = 'spent' THEN amount ELSE 0 END), 0) AS d,
            COALESCE(SUM(CASE WHEN ledger_type IN ('earned', 'airdrop', 'bonus') THEN amount ELSE 0 END), 0) AS e
     FROM token_ledger WHERE user_id = $1`,
    [uid]
  );
  const bal = parseFloat((parseFloat(s.rows[0].c) - parseFloat(s.rows[0].d)).toFixed(5));
  const earned = parseFloat(s.rows[0].e);
  await pool.query('UPDATE users SET available_tokens = $1, total_tokens_earned = $2 WHERE id = $3', [bal, earned, uid]);
  console.log('Removed duplicate 2.8 EZT; balance recomputed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
