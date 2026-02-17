#!/usr/bin/env node
/**
 * Re-geocode partners whose stored lat/lng fall in Mumbai's bounding box (wrong city).
 * Uses server geocoding with India qualification so addresses like "M3M Urbana, Sector 67, Gurgaon"
 * resolve to Gurgaon (lat ~28.4, lng ~77.1), not Kurla/Mumbai (lat ~19, lng ~72.8).
 *
 * Mumbai bounding box (approx): lat 18.9–19.3, lng 72.7–72.9
 * We select partners with lat in [18, 21] and lng in [72, 74] to catch nearby wrong results.
 *
 * Requires GOOGLE_GEOCODING_API_KEY. Run from backend: node scripts/fix-mumbai-geocoded-partners.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getPool } = require('../src/config/db');
const geocodingService = require('../src/services/geocodingService');
const partnerRepository = require('../src/repositories/partnerRepository');
const { log } = require('../src/utils/logger');

const pool = getPool();

const MUMBAI_LAT_MIN = 18;
const MUMBAI_LAT_MAX = 21;
const MUMBAI_LNG_MIN = 72;
const MUMBAI_LNG_MAX = 74;

async function main() {
  if (!process.env.GOOGLE_GEOCODING_API_KEY) {
    log('GOOGLE_GEOCODING_API_KEY is not set. Set it in backend/.env and run again.');
    process.exit(1);
  }

  log('--- Fix partners geocoded to Mumbai region ---');
  const result = await pool.query(
    `SELECT id, name, address, latitude, longitude FROM partners
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       AND TRIM(COALESCE(address, '')) != ''
       AND latitude BETWEEN $1 AND $2
       AND longitude BETWEEN $3 AND $4
     ORDER BY name`,
    [MUMBAI_LAT_MIN, MUMBAI_LAT_MAX, MUMBAI_LNG_MIN, MUMBAI_LNG_MAX]
  );

  const partners = result.rows;
  log(`Found ${partners.length} partner(s) with coordinates in Mumbai bounding box.`);

  let updated = 0;
  let failed = 0;
  const delayMs = 250;

  for (const p of partners) {
    try {
      const geo = await geocodingService.geocodeAddress(p.address);
      if (geo) {
        await partnerRepository.updatePartnerGeo(p.id, {
          latitude: geo.latitude,
          longitude: geo.longitude,
          place_id: geo.place_id || null,
          geo_verified: true,
          formatted_address: geo.formatted_address || null,
        });
        log(`  ✓ ${p.name}: ${p.latitude},${p.longitude} → ${geo.latitude},${geo.longitude}`);
        updated++;
      } else {
        log(`  ✗ ${p.name}: geocode returned no result (address: ${(p.address || '').slice(0, 50)}...)`);
        failed++;
      }
    } catch (err) {
      log(`  ✗ ${p.name}: ${err.message || err}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  log(`Done. Updated: ${updated}, Failed: ${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
