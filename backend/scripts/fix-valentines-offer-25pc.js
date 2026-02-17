/**
 * Set Bikers Cafe "Valentines Offer" discount to 25% (matches banner: CO-PAY UPTO 25% THRU $EZT).
 * Run once: node scripts/fix-valentines-offer-25pc.js
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();

  const result = await pool.query(
    `UPDATE partner_offers po
     SET co_pay_percentage = 25
     FROM partners p
     WHERE po.partner_id = p.id
       AND p.name ILIKE '%Bikers Cafe%'
       AND po.title ILIKE '%Valentin%'
     RETURNING po.id, po.title, po.co_pay_percentage`
  );

  if (result.rows.length === 0) {
    console.log('No Valentines offer found for Bikers Cafe. Nothing updated.');
    return;
  }
  console.log('Updated to 25%:', result.rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
