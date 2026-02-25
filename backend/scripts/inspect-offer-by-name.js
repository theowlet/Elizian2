/**
 * Inspect a partner offer by partner name and offer title (e.g. Bikers Cafe, Valentines).
 * Run from backend: node scripts/inspect-offer-by-name.js "Bikers Cafe" "Valentin"
 *
 * Usage:
 *   node scripts/inspect-offer-by-name.js [partnerName] [offerTitlePattern]
 *   node scripts/inspect-offer-by-name.js --title "Holi Milan"   # search offers by title across all partners (shows image_url)
 * If no args: lists all partners and one sample offer each.
 */

const path = require('path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

async function main() {
  const { getPool } = require(path.join(backendRoot, 'src/config/db'));
  const pool = getPool();

  const firstArg = process.argv[2] || null;
  const secondArg = process.argv[3] || null;

  // Mode: search by offer title across all partners (for image_url diagnostics)
  if (firstArg === '--title' && secondArg) {
    const titlePattern = '%' + secondArg + '%';
    const res = await pool.query(
      `SELECT po.id, po.title, po.image_url, p.name AS partner_name
       FROM partner_offers po
       JOIN partners p ON p.id = po.partner_id
       WHERE po.title ILIKE $1
       ORDER BY p.name, po.title`,
      [titlePattern]
    );
    console.log('Offers matching title', JSON.stringify(secondArg), '\n');
    for (const row of res.rows) {
      console.log('  title:', row.title);
      console.log('  id:', row.id);
      console.log('  partner:', row.partner_name);
      console.log('  image_url:', row.image_url == null ? '(null)' : (row.image_url.length > 80 ? row.image_url.slice(0, 80) + '...' : row.image_url));
      console.log('');
    }
    if (res.rows.length === 0) console.log('  (none)\n');
    return;
  }

  const partnerName = firstArg;
  const offerTitlePattern = secondArg;

  if (!partnerName) {
    const partners = await pool.query(
      `SELECT p.id, p.name FROM partners p ORDER BY p.name LIMIT 20`
    );
    console.log('Partners (first 20):');
    for (const row of partners.rows) {
      const offers = await pool.query(
        `SELECT id, title, co_pay_percentage, discount_amount, offer_type, start_date, end_date, status
         FROM partner_offers WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [row.id]
      );
      console.log(`  ${row.name} (${row.id})`);
      offers.rows.forEach((o) => {
        console.log(`    - ${o.title}: co_pay_percentage=${o.co_pay_percentage}, discount_amount=${o.discount_amount}, type=${o.offer_type}`);
      });
    }
    return;
  }

  const partnerResult = await pool.query(
    `SELECT id, name FROM partners WHERE name ILIKE $1`,
    ['%' + partnerName + '%']
  );
  if (partnerResult.rows.length === 0) {
    console.log('No partner found matching:', partnerName);
    return;
  }

  for (const partner of partnerResult.rows) {
    console.log('Partner:', partner.name, '(', partner.id, ')\n');
    let offersQuery = `SELECT id, title, description, image_url, co_pay_percentage, discount_amount, offer_type, original_price, discounted_price, start_date, end_date, status, is_active
                        FROM partner_offers WHERE partner_id = $1`;
    const params = [partner.id];
    if (offerTitlePattern) {
      offersQuery += ` AND title ILIKE $2`;
      params.push('%' + offerTitlePattern + '%');
    }
    offersQuery += ` ORDER BY created_at DESC`;

    const offers = await pool.query(offersQuery, params);
    if (offers.rows.length === 0) {
      console.log('No offers found' + (offerTitlePattern ? ` with title matching "${offerTitlePattern}"` : '') + '.\n');
      continue;
    }

    for (const o of offers.rows) {
      console.log('Offer:', o.title);
      console.log('  id:', o.id);
      console.log('  image_url:', o.image_url == null ? '(null)' : (o.image_url.length > 60 ? o.image_url.slice(0, 60) + '...' : o.image_url));
      console.log('  co_pay_percentage:', o.co_pay_percentage);
      console.log('  discount_amount:', o.discount_amount);
      console.log('  offer_type:', o.offer_type);
      console.log('  original_price:', o.original_price, '| discounted_price:', o.discounted_price);
      console.log('  start_date:', o.start_date, '| end_date:', o.end_date);
      console.log('  status:', o.status, '| is_active:', o.is_active);
      if (o.description) console.log('  description:', (o.description || '').slice(0, 80) + '...');
      console.log('');

      const { calculateRedemptionAmounts } = require(path.join(backendRoot, 'src/services/redemptionCalculationService'));
      const sample = calculateRedemptionAmounts(o.id, 2000, o);
      console.log('  Sample calculation (bill ₹2000):', JSON.stringify(sample, null, 2));
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
