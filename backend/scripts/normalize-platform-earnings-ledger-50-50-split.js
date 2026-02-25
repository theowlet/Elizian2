/**
 * One-time: set fiat_component and ezt_component to a 50/50 split of platform_fee_total
 * so that Fiat = EZT on the Platform Earnings screen for all history.
 * Sum is preserved: fiat_component + ezt_component = platform_fee_total.
 *
 * Run from backend: node scripts/normalize-platform-earnings-ledger-50-50-split.js
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
    `SELECT COUNT(*)::int AS n FROM platform_earnings_ledger WHERE fiat_component != ezt_component OR ABS((fiat_component + ezt_component) - platform_fee_total) > 0.01`
  );
  const toFix = count.rows[0]?.n ?? 0;

  if (toFix === 0) {
    console.log('No rows need normalization (all already 50/50 split).');
    process.exit(0);
  }

  if (!apply) {
    console.log(`Would normalize ${toFix} row(s) to 50/50 split: fiat_component = ezt_component = half of platform_fee_total. Run with --apply to update.`);
    process.exit(0);
  }

  // Set fiat_component = round(half), ezt_component = total - fiat so they sum exactly
  const result = await pool.query(
    `UPDATE platform_earnings_ledger
     SET
       fiat_component = ROUND(platform_fee_total / 2, 2),
       ezt_component = platform_fee_total - ROUND(platform_fee_total / 2, 2)
     WHERE fiat_component != ezt_component OR ABS((fiat_component + ezt_component) - platform_fee_total) > 0.01`
  );
  console.log(`Normalized ${result.rowCount} row(s). Platform Earnings will now show Fiat = EZT for all tiers/partners.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
