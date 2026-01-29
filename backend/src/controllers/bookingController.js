const bookingService = require("../services/bookingService");
const { successResponse, errorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");
const {getS3FileUrl} = require("../../utils/s3Bucket")

// Create a new booking
async function createBooking(req, res) {
  try {
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
        booking = await qrCodeRegenerationService.regenerateQRCode(id);
        log(`✅ QR code regenerated for booking ${id}`);
      } catch (regenerateError) {
        // Log but don't fail - booking can still be returned without QR code
        logError(
          "⚠️ QR code regeneration failed (non-blocking):",
          regenerateError,
        );
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

module.exports = {
  createBooking,
  listBookings,
  updateBooking,
  getBooking,
  confirmPayment,
};
