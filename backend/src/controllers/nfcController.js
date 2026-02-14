const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { logError } = require('../utils/logger');
const crypto = require('crypto');

const pool = getPool();

// Generate a short, unique puck code (8 chars, URL-safe)
function generatePuckCode() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
}

// ─── Partner endpoints ───────────────────────────────────────────────

// List all pucks for a partner
async function listPucks(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) return errorResponse(res, 403, 'Partner access required');

    const result = await pool.query(
      `SELECT id, puck_code, label, location_hint, is_active, tap_count, last_tapped_at, created_at
       FROM nfc_pucks WHERE partner_id = $1 ORDER BY created_at DESC`,
      [partnerId]
    );
    return successResponse(res, 200, 'NFC pucks retrieved', result.rows);
  } catch (err) {
    logError('listPucks error:', err);
    return errorResponse(res, 500, 'Failed to list NFC pucks');
  }
}

// Register a new NFC puck
async function registerPuck(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) return errorResponse(res, 403, 'Partner access required');

    const { label, location_hint } = req.body;
    const puckCode = generatePuckCode();

    const result = await pool.query(
      `INSERT INTO nfc_pucks (puck_code, partner_id, label, location_hint)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [puckCode, partnerId, label || null, location_hint || null]
    );

    return successResponse(res, 201, 'NFC puck registered', result.rows[0]);
  } catch (err) {
    logError('registerPuck error:', err);
    return errorResponse(res, 500, 'Failed to register NFC puck');
  }
}

// Update a puck (label, location_hint, is_active)
async function updatePuck(req, res) {
  try {
    const partnerId = req.partnerId;
    const puckId = req.params.puckId;
    if (!partnerId) return errorResponse(res, 403, 'Partner access required');

    const { label, location_hint, is_active } = req.body;

    const result = await pool.query(
      `UPDATE nfc_pucks
       SET label = COALESCE($1, label),
           location_hint = COALESCE($2, location_hint),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $4 AND partner_id = $5
       RETURNING *`,
      [label, location_hint, is_active, puckId, partnerId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Puck not found');
    }
    return successResponse(res, 200, 'NFC puck updated', result.rows[0]);
  } catch (err) {
    logError('updatePuck error:', err);
    return errorResponse(res, 500, 'Failed to update puck');
  }
}

// Delete a puck
async function deletePuck(req, res) {
  try {
    const partnerId = req.partnerId;
    const puckId = req.params.puckId;
    if (!partnerId) return errorResponse(res, 403, 'Partner access required');

    const result = await pool.query(
      `DELETE FROM nfc_pucks WHERE id = $1 AND partner_id = $2 RETURNING id`,
      [puckId, partnerId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Puck not found');
    }
    return successResponse(res, 200, 'NFC puck deleted', { deleted: true });
  } catch (err) {
    logError('deletePuck error:', err);
    return errorResponse(res, 500, 'Failed to delete puck');
  }
}

// Get tap analytics for a partner's pucks
async function getPuckAnalytics(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) return errorResponse(res, 403, 'Partner access required');

    const days = parseInt(req.query.days) || 30;

    const result = await pool.query(
      `SELECT
         np.id AS puck_id, np.puck_code, np.label, np.tap_count,
         COUNT(nte.id) FILTER (WHERE nte.created_at >= NOW() - INTERVAL '1 day' * $2) AS recent_taps,
         COUNT(DISTINCT nte.user_id) FILTER (WHERE nte.created_at >= NOW() - INTERVAL '1 day' * $2) AS unique_users
       FROM nfc_pucks np
       LEFT JOIN nfc_tap_events nte ON nte.puck_id = np.id
       WHERE np.partner_id = $1
       GROUP BY np.id, np.puck_code, np.label, np.tap_count
       ORDER BY np.tap_count DESC`,
      [partnerId, days]
    );

    return successResponse(res, 200, 'NFC puck analytics', result.rows);
  } catch (err) {
    logError('getPuckAnalytics error:', err);
    return errorResponse(res, 500, 'Failed to get puck analytics');
  }
}

// ─── Public tap endpoint (consumer taps NFC puck) ────────────────────

async function handleTap(req, res) {
  try {
    const { puckCode } = req.params;
    const userId = req.userId || null; // May be unauthenticated
    const { latitude, longitude } = req.body || {};

    // Look up the puck
    const puckResult = await pool.query(
      `SELECT np.*, p.name AS partner_name, p.id AS partner_id,
              p.latitude AS venue_lat, p.longitude AS venue_lng,
              p.partner_category_type, p.description AS partner_description,
              p.address AS partner_address
       FROM nfc_pucks np
       JOIN partners p ON p.id = np.partner_id
       WHERE np.puck_code = $1`,
      [puckCode]
    );

    if (puckResult.rows.length === 0) {
      return errorResponse(res, 404, 'Unknown NFC puck');
    }

    const puck = puckResult.rows[0];

    if (!puck.is_active) {
      return errorResponse(res, 410, 'This NFC puck has been deactivated');
    }

    // Log the tap event
    await pool.query(
      `INSERT INTO nfc_tap_events (puck_id, partner_id, user_id, tap_type, latitude, longitude, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [puck.id, puck.partner_id, userId, 'checkin', latitude || null, longitude || null, req.headers['user-agent'] || null]
    );

    // Increment tap count
    await pool.query(
      `UPDATE nfc_pucks SET tap_count = tap_count + 1, last_tapped_at = NOW() WHERE id = $1`,
      [puck.id]
    );

    // If user is logged in, auto check-in their active booking at this venue
    let autoCheckIn = null;
    if (userId) {
      const activeBooking = await pool.query(
        `SELECT id, booking_reference, deal_id, status
         FROM bookings
         WHERE user_id = $1 AND partner_id = $2 AND status = 'confirmed'
           AND checked_in_at IS NULL
         ORDER BY booking_date DESC LIMIT 1`,
        [userId, puck.partner_id]
      );

      if (activeBooking.rows.length > 0) {
        const bookingId = activeBooking.rows[0].id;
        await pool.query(
          `UPDATE bookings SET checked_in_at = NOW(), check_in_lat = $1, check_in_lng = $2
           WHERE id = $3`,
          [latitude || null, longitude || null, bookingId]
        );
        autoCheckIn = {
          booking_id: bookingId,
          booking_reference: activeBooking.rows[0].booking_reference
        };
      }

      // Increment EZ Club network check-ins (if new venue for this user)
      try {
        const prevVisit = await pool.query(
          `SELECT 1 FROM nfc_tap_events WHERE user_id = $1 AND partner_id = $2 AND id != (
             SELECT id FROM nfc_tap_events WHERE user_id = $1 AND partner_id = $2 ORDER BY created_at DESC LIMIT 1
           ) LIMIT 1`,
          [userId, puck.partner_id]
        );
        // First time at this venue via NFC — count for EZ Club
        if (prevVisit.rows.length === 0) {
          await pool.query(
            `UPDATE users SET ez_club_network_check_ins = COALESCE(ez_club_network_check_ins, 0) + 1 WHERE id = $1`,
            [userId]
          );
          // Check if qualified for EZ Club (5+ unique venues)
          const clubCheck = await pool.query(
            `SELECT ez_club_network_check_ins FROM users WHERE id = $1`,
            [userId]
          );
          if (clubCheck.rows.length > 0 && clubCheck.rows[0].ez_club_network_check_ins >= 5) {
            await pool.query(
              `UPDATE users SET ez_club_member = true, ez_club_qualified_at = COALESCE(ez_club_qualified_at, NOW()) WHERE id = $1`,
              [userId]
            );
          }
        }
      } catch (_) { /* EZ Club update is best-effort */ }
    }

    // Return venue info for the frontend to render
    return successResponse(res, 200, 'NFC tap processed', {
      puck_code: puck.puck_code,
      puck_label: puck.label,
      location_hint: puck.location_hint,
      partner_id: puck.partner_id,
      partner_name: puck.partner_name,
      partner_category: puck.partner_category_type,
      partner_description: puck.partner_description,
      partner_address: puck.partner_address,
      auto_check_in: autoCheckIn,
      actions: ['view_venue', 'book', 'review', 'tip', 'message']
    });

  } catch (err) {
    logError('handleTap error:', err);
    return errorResponse(res, 500, 'Failed to process NFC tap');
  }
}

module.exports = {
  listPucks,
  registerPuck,
  updatePuck,
  deletePuck,
  getPuckAnalytics,
  handleTap,
};
