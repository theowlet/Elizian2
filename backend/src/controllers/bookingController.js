const bookingService = require("../services/bookingService");
const { successResponse, errorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const { getS3FileUrl } = require("../../utils/s3Bucket");
const { getPool } = require("../config/db");

// Create a new booking
async function createBooking(req, res) {
  try {
    if (req.tierAccessGranted === false && req.offerMinTier) {
      return errorResponse(res, 403, `This experience requires ${req.offerMinTier} tier or higher. Your current tier: ${req.userTier || 'Ather'}`);
    }

    // Log incoming request for debugging
    console.log("📥 Booking request received:", {
      user_id: req.userId,
      body: {
        ...req.body,
        reservation_data: req.body.reservation_data ? "(present)" : "(none)",
        pre_order_data: req.body.pre_order_data ? "(present)" : "(none)",
      },
    });

    const {
      event_id,
      offer_id,
      show_id,
      seat_template_ids,
      num_tickets = 1,
      special_requests,
      ezt_to_redeem,
      // New fields for bank offers, reservations, pre-orders
      bank_offer_id,
      bank_offer_rule_id,
      reservation_data,
      pre_order_data,
      // Direct booking date/time (for events)
      booking_date,
      booking_time,
    } = req.body;
    const user_id = req.userId;

    const booking = await bookingService.createBooking({
      event_id,
      offer_id,
      show_id,
      seat_template_ids,
      num_tickets,
      special_requests,
      ezt_to_redeem,
      user_id,
      // New fields
      bank_offer_id,
      bank_offer_rule_id,
      reservation_data,
      pre_order_data,
      // Direct booking date/time (for events)
      booking_date,
      booking_time,
    });

    successResponse(res, 201, "Booking created successfully", booking);
  } catch (err) {
    logError("❌ Booking creation error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to create booking",
    );
  }
}

// List bookings
async function listBookings(req, res) {
  try {
    const { user_id, partner_id, status, limit = 50, offset = 0 } = req.query;
    const filters = {
      userId: user_id || req.userId || null,
      partnerId: partner_id || null,
      status: status || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };

    const bookings = await bookingService.listBookings(filters);
    bookings.forEach((item) => {
      item.qr_code_url = getS3FileUrl(item.qr_code_url);
    });
    successResponse(res, 200, "Bookings retrieved successfully", bookings);
  } catch (err) {
    logError("❌ List bookings error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to retrieve bookings",
    );
  }
}

// Update/Reschedule booking
async function updateBooking(req, res) {
  try {
    const { id } = req.params;
    const { booking_date, booking_time } = req.body;
    const user_id = req.userId;

    if (!booking_date) {
      return errorResponse(res, 400, "Booking date is required");
    }

    const updatedBooking = await bookingService.rescheduleBooking(id, user_id, {
      booking_date,
      booking_time,
    });

    successResponse(
      res,
      200,
      "Booking rescheduled successfully",
      updatedBooking,
    );
  } catch (err) {
    logError("❌ Booking update/reschedule error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to reschedule booking",
    );
  }
}

// Get booking by ID
async function getBooking(req, res) {
  try {
    const { id } = req.params;
    let booking = await bookingService.getBookingById(id);

    // If booking doesn't have QR code but has voucher_code, try to regenerate it
    if (!booking.qr_code_url && booking.voucher_code) {
      try {
        const qrCodeRegenerationService = require("../services/qrCodeRegenerationService");
        const regenerated = await qrCodeRegenerationService.regenerateQRCode(id);
        // Preserve voucher display fields (never overwrite deal/venue from voucher)
        booking = {
          ...regenerated,
          partner_name: booking.partner_name ?? regenerated.partner_name,
          deal_title: booking.deal_title ?? regenerated.deal_title,
          qr_code_url: getS3FileUrl(regenerated.qr_code_url),
        };
        log(`✅ QR code regenerated for booking ${id}`);
      } catch (regenerateError) {
        // Log but don't fail - booking can still be returned without QR code
        logError(
          "⚠️ QR code regeneration failed (non-blocking):",
          regenerateError,
        );
      }
    }

    // Always normalize qr_code_url to a full URL (S3 or existing http(s)) so the frontend can load the image
    if (booking.qr_code_url) {
      booking.qr_code_url = getS3FileUrl(booking.qr_code_url) || booking.qr_code_url;
    }

    // If booking is redeemed and the requester is the owner, attach disputable_redemption when within dispute window
    if (req.userId && String(booking.user_id) === String(req.userId) && booking.status === "redeemed") {
      try {
        const pool = getPool();
        const ra = await pool.query(
          `SELECT id, dispute_window_expires_at FROM redemption_audit
           WHERE booking_id = $1 AND redemption_status = 'redeemed'
             AND dispute_window_expires_at IS NOT NULL AND dispute_window_expires_at > NOW()
           ORDER BY redeemed_at DESC LIMIT 1`,
          [id]
        );
        if (ra.rows.length > 0) {
          booking.disputable_redemption = {
            redemption_id: ra.rows[0].id,
            dispute_window_expires_at: ra.rows[0].dispute_window_expires_at,
          };
        }
      } catch (e) {
        logError("Disputable redemption lookup (non-fatal):", e);
      }
    }

    successResponse(res, 200, "Booking retrieved successfully", booking);
  } catch (err) {
    logError("❌ Get booking error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to retrieve booking",
    );
  }
}

// Confirm payment for booking
async function confirmPayment(req, res) {
  try {
    const { bookingId } = req.params;
    const userId = req.userId;

    const booking = await bookingService.confirmPayment(bookingId, userId);
    successResponse(res, 200, "Payment confirmed successfully", booking);
  } catch (err) {
    logError("❌ Confirm payment error:", err);
    errorResponse(
      res,
      err.statusCode || 500,
      err.message || "Failed to confirm payment",
    );
  }
}

const visitSessionService = require('../services/visitSessionService');

// Consumer check-in at venue (visit session + 100m geofence)
async function checkInAtVenue(req, res) {
  try {
    const { latitude, longitude } = req.body;
    const bookingId = req.params.id;
    const userId = req.userId;

    if (latitude == null || longitude == null) {
      return errorResponse(res, 400, 'Location (latitude, longitude) is required');
    }

    const session = await visitSessionService.checkInAndCreateSession({
      bookingId,
      userId,
      latitude,
      longitude,
      qrScanVerified: false,
    });

    return successResponse(res, 200, 'Checked in successfully', {
      visit_session_id: session.id,
      geo_verified: session.geo_verified,
      distance_meters: session.check_in_distance_meters,
      expires_at: session.expires_at,
    });
  } catch (err) {
    logError('Check-in error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Check-in failed');
  }
}

// QR-based check-in at venue (voucher_code in qr_payload)
async function qrCheckIn(req, res) {
  try {
    const { qr_payload, latitude, longitude } = req.body || {};
    const bookingId = req.params.id;
    const userId = req.userId;

    const pool = getPool();
    const code = qr_payload || req.body?.voucher_code;
    if (!code) {
      return errorResponse(res, 400, 'qr_payload or voucher_code is required');
    }

    const bookingResult = await pool.query(
      `SELECT id, user_id, partner_id FROM bookings WHERE id = $1 AND voucher_code::text = $2`,
      [bookingId, String(code).trim()]
    );
    if (bookingResult.rows.length === 0) {
      return errorResponse(res, 404, 'Booking not found or voucher code does not match');
    }
    const booking = bookingResult.rows[0];
    if (booking.user_id !== userId) {
      return errorResponse(res, 403, 'Not your booking');
    }

    const session = await visitSessionService.checkInAndCreateSession({
      bookingId: booking.id,
      userId: booking.user_id,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      qrScanVerified: true,
    });

    return successResponse(res, 200, 'Checked in via QR successfully', {
      visit_session_id: session.id,
      geo_verified: session.geo_verified,
      distance_meters: session.check_in_distance_meters,
      expires_at: session.expires_at,
    });
  } catch (err) {
    logError('QR check-in error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'QR check-in failed');
  }
}

module.exports = {
  createBooking,
  listBookings,
  updateBooking,
  getBooking,
  confirmPayment,
  checkInAtVenue,
  qrCheckIn,
};
