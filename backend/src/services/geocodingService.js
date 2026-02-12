/**
 * Server-side geocoding via Google Geocoding API.
 * Used when partner creates/edits address. API key must never be exposed to frontend.
 */

const { logError, log } = require('../../utils/logger');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Geocode an address string. Returns { formatted_address, latitude, longitude, place_id } or null on failure.
 * Does not throw; on API error or missing key returns null (caller should set geo_verified = false).
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

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', trimmed);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      logError('[Geocoding] API returned non-OK or no results', { status: data.status, address: trimmed });
      return null;
    }

    const first = data.results[0];
    const lat = first.geometry?.location?.lat;
    const lng = first.geometry?.location?.lng;
    if (lat == null || lng == null) {
      logError('[Geocoding] Missing lat/lng in result', { address: trimmed });
      return null;
    }

    return {
      formatted_address: first.formatted_address || trimmed,
      latitude: Number(lat),
      longitude: Number(lng),
      place_id: first.place_id || null,
    };
  } catch (err) {
    logError('[Geocoding] Request failed', { address: trimmed, error: err?.message });
    return null;
  }
}

module.exports = {
  geocodeAddress,
};
