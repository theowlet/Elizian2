/**
 * User's stats at a specific venue: visit count, EZT earned at venue.
 * Used for "You & this venue" block on VenueDetailPage.
 */
const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function getVenueStats(req, res) {
  try {
    const userId = req.userId;
    const { partnerId } = req.params;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    if (!partnerId) return errorResponse(res, 400, 'Partner ID required');

    const pool = getPool();
    const [visitResult, eztResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(b.id)::int AS visit_count
         FROM bookings b
         INNER JOIN partner_offers po ON po.id = b.deal_id AND po.partner_id = $2
         WHERE b.user_id = $1 AND b.status IN ('confirmed', 'redeemed')`,
        [userId, partnerId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(tokens_earned), 0)::numeric AS ezt_earned
         FROM transactions
         WHERE user_id = $1 AND partner_id = $2 AND payment_status = 'completed'`,
        [userId, partnerId]
      ).catch(() => ({ rows: [{ ezt_earned: 0 }] }))
    ]);

    const visit_count = visitResult.rows[0]?.visit_count ?? 0;
    const ezt_earned_at_venue = parseFloat(eztResult.rows[0]?.ezt_earned ?? 0);

    successResponse(res, 200, 'Venue stats', { visit_count, ezt_earned_at_venue });
  } catch (err) {
    logError('getVenueStats error:', err);
    errorResponse(res, 500, err.message || 'Failed to get venue stats');
  }
}

module.exports = { getVenueStats };
