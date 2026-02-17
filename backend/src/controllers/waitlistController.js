const waitlistService = require('../services/waitlistService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Waitlist Controller
 *
 * Handles user and partner-facing waitlist endpoints
 */

/**
 * Join waitlist for a time slot
 * POST /api/v1/waitlist/join
 * Body: { partner_id, booking_date, booking_time, party_size, special_requests }
 */
async function joinWaitlist(req, res) {
  try {
    const userId = req.userId; // From authenticateToken
    const { partner_id, booking_date, booking_time, party_size, special_requests } = req.body;

    if (!partner_id || !booking_date || !booking_time) {
      return errorResponse(res, 400, 'partner_id, booking_date, and booking_time are required.');
    }

    if (!party_size || party_size < 1 || party_size > 50) {
      return errorResponse(res, 400, 'party_size must be between 1 and 50.');
    }

    // Get user tier for waitlist priority (future enhancement)
    const bookingValidation = require('../services/bookingValidation');
    const user_tier = await bookingValidation.getUserTier(userId);

    const result = await waitlistService.joinWaitlist({
      partner_id,
      user_id: userId,
      booking_date,
      booking_time,
      party_size,
      user_tier,
      special_requests
    });

    if (!result.success) {
      return errorResponse(res, 409, result.message);
    }

    return successResponse(res, 201, 'Successfully joined waitlist', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get user's waitlist entries
 * GET /api/v1/waitlist/my-entries?status=waiting
 */
async function getMyWaitlistEntries(req, res) {
  try {
    const userId = req.userId;
    const { status } = req.query;

    const entries = await waitlistService.getUserWaitlistEntries(userId, status || null);
    return successResponse(res, 200, 'Success', entries);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Cancel waitlist entry
 * DELETE /api/v1/waitlist/:id
 */
async function cancelWaitlistEntry(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, 'Waitlist entry ID is required.');
    }

    const cancelledEntry = await waitlistService.cancelWaitlistEntry(id, userId);
    return successResponse(res, 200, 'Waitlist entry cancelled successfully', cancelledEntry);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get waitlist for a specific time slot (partner-only)
 * GET /api/v1/partner/:partnerId/waitlist?booking_date=2026-02-20&booking_time=19:00&status=waiting
 */
async function getPartnerWaitlist(req, res) {
  try {
    const partnerId = req.params.partnerId || req.partnerId;
    const { booking_date, booking_time, status } = req.query;

    if (!booking_date || !booking_time) {
      return errorResponse(res, 400, 'booking_date and booking_time are required.');
    }

    const entries = await waitlistService.getWaitlistForSlot(
      partnerId,
      booking_date,
      booking_time,
      status || 'waiting'
    );

    return successResponse(res, 200, 'Success', entries);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Notify next person in waitlist (partner-only, manual trigger)
 * POST /api/v1/partner/:partnerId/waitlist/notify-next
 * Body: { booking_date, booking_time }
 */
async function notifyNext(req, res) {
  try {
    const partnerId = req.params.partnerId || req.partnerId;
    const { booking_date, booking_time } = req.body;

    if (!booking_date || !booking_time) {
      return errorResponse(res, 400, 'booking_date and booking_time are required.');
    }

    const notifiedEntry = await waitlistService.notifyNextInWaitlist(
      partnerId,
      booking_date,
      booking_time
    );

    if (!notifiedEntry) {
      return successResponse(res, 200, 'No one waiting for this time slot', null);
    }

    return successResponse(res, 200, 'Next person notified successfully', notifiedEntry);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get waitlist statistics (partner-only)
 * GET /api/v1/partner/:partnerId/waitlist/stats?date_from=2026-02-01&date_to=2026-02-28
 */
async function getWaitlistStats(req, res) {
  try {
    const partnerId = req.params.partnerId || req.partnerId;
    const { date_from, date_to } = req.query;

    const stats = await waitlistService.getWaitlistStats(partnerId, date_from, date_to);
    return successResponse(res, 200, 'Success', stats);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Expire old notifications (admin/cron job endpoint)
 * POST /api/v1/waitlist/expire-notifications
 */
async function expireNotifications(req, res) {
  try {
    const expiredCount = await waitlistService.expireOldNotifications();
    return successResponse(res, 200, `Expired ${expiredCount} notifications`, { expired_count: expiredCount });
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

module.exports = {
  joinWaitlist,
  getMyWaitlistEntries,
  cancelWaitlistEntry,
  getPartnerWaitlist,
  notifyNext,
  getWaitlistStats,
  expireNotifications
};
