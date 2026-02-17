/**
 * Server-side geocoding via Google Geocoding API.
 * Used when partner creates/edits address. API key must never be exposed to frontend.
 */

const { logError, log } = require('../../utils/logger');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Append ", India" if not already present to avoid resolving ambiguous addresses (e.g. Urbana, Sector 67) to wrong country/city. */
function qualifyAddressForIndia(address) {
  if (!address || typeof address !== 'string') return address || '';
  const t = address.trim();
  if (!t) return t;
  return /\bIndia\b/i.test(t) ? t : `${t}, India`;
}

/**
 * Geocode an address string. Returns { formatted_address, latitude, longitude, place_id } or null on failure.
 * Uses region=IN and components=country:IN so ambiguous queries (e.g. "M3M urbana, sector 67, gurgaon") resolve to India, not e.g. Kurla Mumbai.
 * Set GOOGLE_GEOCODING_API_KEY in env (server-side only).
 *
 * @param {string} address - Raw address string
 * @returns {Promise<{ formatted_address: string, latitude: number, longitude: number, place_id: string } | null>}
 */
async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey || !address || typeof address !== 'string') {
    if (!apiKey && address) {
      log('[Geocoding] GOOGLE_GEOCODING_API_KEY not set; skipping geocode');
    }
    return null;
  }

  const trimmed = address.trim();
  if (!trimmed) return null;
  const qualifiedAddress = qualifyAddressForIndia(trimmed);

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', qualifiedAddress);
    url.searchParams.set('region', 'in');
    url.searchParams.set('components', 'country:IN');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      logError('[Geocoding] API returned non-OK or no results', { status: data.status, address: qualifiedAddress });
      return null;
    }

    const first = data.results[0];
    const lat = first.geometry?.location?.lat;
    const lng = first.geometry?.location?.lng;
    if (lat == null || lng == null) {
      logError('[Geocoding] Missing lat/lng in result', { address: qualifiedAddress });
      return null;
    }
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (latNum === 0 && lngNum === 0) {
      logError('[Geocoding] Rejecting 0,0 (Null Island) as invalid', { address: qualifiedAddress });
      return null;
    }

    return {
      formatted_address: first.formatted_address || qualifiedAddress,
      latitude: latNum,
      longitude: lngNum,
      place_id: first.place_id || null,
    };
  } catch (err) {
    logError('[Geocoding] Request failed', { address: qualifiedAddress, error: err?.message });
    return null;
  }
}

module.exports = {
  geocodeAddress,
  qualifyAddressForIndia,
};
