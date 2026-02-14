const { getPool } = require('../config/db');
const pool = getPool();

async function createSession({
  bookingId,
  userId,
  partnerId,
  lat,
  lng,
  distanceMeters,
  geoVerified,
  qrScanVerified = false,
  executor = pool,
}) {
  const result = await executor.query(
    `INSERT INTO visit_sessions (
      booking_id, user_id, partner_id,
      check_in_lat, check_in_lng, check_in_distance_meters,
      geo_verified, qr_scan_verified,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '4 hours')
    RETURNING *`,
    [
      bookingId,
      userId,
      partnerId,
      lat ?? null,
      lng ?? null,
      distanceMeters ?? null,
      geoVerified ?? false,
      qrScanVerified,
    ]
  );
  return result.rows[0];
}

async function getActiveSession(userId, partnerId, executor = pool) {
  const result = await executor.query(
    `SELECT * FROM visit_sessions
     WHERE user_id = $1 AND partner_id = $2 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [userId, partnerId]
  );
  return result.rows[0];
}

async function getSessionById(id, executor = pool) {
  const result = await executor.query(`SELECT * FROM visit_sessions WHERE id = $1`, [id]);
  return result.rows[0];
}

async function getSessionByBookingId(bookingId, executor = pool) {
  const result = await executor.query(
    `SELECT * FROM visit_sessions WHERE booking_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [bookingId]
  );
  return result.rows[0];
}

async function completeSession(id, executor = pool) {
  const result = await executor.query(
    `UPDATE visit_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function expireSession(id, executor = pool) {
  const result = await executor.query(
    `UPDATE visit_sessions SET status = 'expired' WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function expireStaleSessionsJob(executor = pool) {
  const result = await executor.query(
    `UPDATE visit_sessions SET status = 'expired'
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING id`
  );
  return result.rows.length;
}

module.exports = {
  createSession,
  getActiveSession,
  getSessionById,
  getSessionByBookingId,
  completeSession,
  expireSession,
  expireStaleSessionsJob,
};
