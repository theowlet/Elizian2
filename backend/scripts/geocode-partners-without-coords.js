#!/usr/bin/env node
/**
 * Geocode all partners that have an address but no latitude/longitude.
 * Uses Google Geocoding API if GOOGLE_GEOCODING_API_KEY is set; otherwise
 * uses OpenStreetMap Nominatim (no API key required). Run from backend:
 * node scripts/geocode-partners-without-coords.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getPool } = require('../src/config/db');
const geocodingService = require('../src/services/geocodingService');
const partnerRepository = require('../src/repositories/partnerRepository');
const { log } = require('../src/utils/logger');

const pool = getPool();

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Geocode via Nominatim (no API key). Fair use: 1 req/sec. Qualifies with ", India" to avoid wrong city (e.g. Urbana → Mumbai). */
async function geocodeWithNominatim(address) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  const qualified = geocodingService.qualifyAddressForIndia(trimmed);
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', qualified);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Elizian-Venue-Geocode/1.0' },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return null;
    return {
      latitude: lat,
      longitude: lng,
      place_id: data[0].place_id || null,
      formatted_address: data[0].display_name || qualified,
    };
  } catch (err) {
    return null;
  }
}

async function geocodeAddress(address) {
  if (process.env.GOOGLE_GEOCODING_API_KEY) {
    return geocodingService.geocodeAddress(address);
  }
  return geocodeWithNominatim(address);
}

async function main() {
  log('--- Geocode partners without coordinates ---');
  log(process.env.GOOGLE_GEOCODING_API_KEY ? 'Using Google Geocoding API.' : 'Using OpenStreetMap Nominatim (no API key).');

  const result = await pool.query(
    `SELECT id, name, address FROM partners
     WHERE TRIM(COALESCE(address, '')) != ''
       AND (latitude IS NULL OR longitude IS NULL)
     ORDER BY name`
  );

  const partners = result.rows;
  log(`Found ${partners.length} partner(s) with address but no coordinates.`);

  let updated = 0;
  let failed = 0;
  const delayMs = process.env.GOOGLE_GEOCODING_API_KEY ? 250 : 1100;

  for (const p of partners) {
    const address = (p.address || '').trim();
    if (!address) continue;

    try {
      const geo = await geocodeAddress(address);
      if (geo) {
        await partnerRepository.updatePartnerGeo(p.id, {
          latitude: geo.latitude,
          longitude: geo.longitude,
          place_id: geo.place_id || null,
          geo_verified: true,
          formatted_address: geo.formatted_address || null,
        });
        log(`  ✓ ${p.name}: ${geo.latitude}, ${geo.longitude}`);
        updated++;
      } else {
        log(`  ✗ ${p.name}: geocode returned no result`);
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
