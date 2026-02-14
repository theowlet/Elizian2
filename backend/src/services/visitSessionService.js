const visitSessionRepository = require('../repositories/visitSessionRepository');
const voucherStateMachine = require('./voucherStateMachine');
const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log } = require('../../utils/logger');

const pool = getPool();
const GEO_RADIUS_M = 100;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check-in at venue and create visit session. Enforces single active visit per user per venue,
 * 100m geo radius, and transitions voucher state from booked -> active.
 */
async function checkInAndCreateSession({ bookingId, userId, latitude, longitude, qrScanVerified = false }) {
  const bookingResult = await pool.query(
    `SELECT b.id, b.user_id, b.partner_id, b.status, b.voucher_state, b.voucher_code,
            p.name AS partner_name, p.latitude AS venue_lat, p.longitude AS venue_lng
     FROM bookings b
     LEFT JOIN partners p ON p.id = b.partner_id
     WHERE b.id = $1`,
    [bookingId]
  );
  if (bookingResult.rows.length === 0) {
    throw new AppError(404, 'Booking not found');
  }
  const booking = bookingResult.rows[0];
  if (booking.user_id !== userId) {
    throw new AppError(403, 'Not your booking');
  }
  if (booking.status !== 'confirmed') {
    throw new AppError(400, `Cannot check in — booking status is "${booking.status}"`);
  }

  const existing = await visitSessionRepository.getActiveSession(booking.user_id, booking.partner_id);
  if (existing) {
    throw new AppError(400, 'You already have an active visit at this venue. Complete or wait for it to expire.');
  }

  let distanceMeters = null;
  let geoVerified = false;
  if (booking.venue_lat != null && booking.venue_lng != null && latitude != null && longitude != null) {
    distanceMeters = Math.round(haversineMeters(
      Number(latitude),
      Number(longitude),
      Number(booking.venue_lat),
      Number(booking.venue_lng)
    ));
    geoVerified = distanceMeters <= GEO_RADIUS_M;
    if (!geoVerified) {
      throw new AppError(422, `You are approximately ${distanceMeters}m from ${booking.partner_name || 'the venue'}. Please move within ${GEO_RADIUS_M}m to check in.`);
    }
  }

  const session = await visitSessionRepository.createSession({
    bookingId: booking.id,
    userId: booking.user_id,
    partnerId: booking.partner_id,
    lat: latitude,
    lng: longitude,
    distanceMeters,
    geoVerified,
    qrScanVerified,
  });

  const currentState = booking.voucher_state || 'booked';
  if (currentState === 'booked') {
    try {
      await voucherStateMachine.transitionState({
        bookingId: booking.id,
        voucherCode: booking.voucher_code,
        fromState: currentState,
        toState: 'active',
        actorId: userId,
        actorRole: 'user',
        executor: pool,
      });
    } catch (e) {
      log('Voucher transition to active failed (may already be active):', e.message);
    }
  }

  await pool.query(
    `UPDATE bookings SET checked_in_at = NOW(), check_in_lat = $1, check_in_lng = $2, check_in_distance = $3 WHERE id = $4`,
    [latitude, longitude, distanceMeters, bookingId]
  );

  log(`Visit session created: ${session.id} for booking ${bookingId}`);
  return session;
}

module.exports = {
  checkInAndCreateSession,
  GEO_RADIUS_M,
};
