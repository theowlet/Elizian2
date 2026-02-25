/**
 * One-time normalization: set fiat_component = platform_fee_total and ezt_component = 0
 * for all rows in platform_earnings_ledger. Aligns historical data with the rule
 * "Platform Fee = (Fiat received) × Tier %" (fee only on fiat, not EZT).
 *
 * Run from backend: node scripts/normalize-platform-earnings-ledger-fiat-only.js
 * Dry run (default): only reports what would change. Use --apply to update.
 */
const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();
  const apply = process.argv.includes('--apply');

  const count = await pool.query(
    `SELECT COUNT(*)::int AS n FROM platform_earnings_ledger WHERE ezt_component != 0 OR fiat_component != platform_fee_total`
  );
  const toFix = count.rows[0]?.n ?? 0;

  if (toFix === 0) {
    console.log('No rows need normalization (all already fiat-only).');
    process.exit(0);
  }

  if (!apply) {
    console.log(`Would normalize ${toFix} row(s): set fiat_component = platform_fee_total, ezt_component = 0. Run with --apply to update.`);
    process.exit(0);
  }

  const result = await pool.query(
    `UPDATE platform_earnings_ledger
     SET fiat_component = platform_fee_total, ezt_component = 0
     WHERE ezt_component != 0 OR fiat_component != platform_fee_total`
  );
  console.log(`Normalized ${result.rowCount} row(s). Platform Earnings will now show EZT component = 0, Fiat = Total.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
