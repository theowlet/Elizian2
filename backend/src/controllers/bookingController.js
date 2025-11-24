const bookingService = require('../services/bookingService');
const { successResponse, errorResponse } = require('../utils/response');
const { logError } = require('../utils/logger');

// Create a new booking
async function createBooking(req, res) {
  try {
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
      pre_order_data
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
      pre_order_data
    });

    successResponse(res, 201, "Booking created successfully", booking);
  } catch (err) {
    logError("❌ Booking creation error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to create booking");
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
      offset: parseInt(offset, 10)
    };

    const bookings = await bookingService.listBookings(filters);
    successResponse(res, 200, "Bookings retrieved successfully", bookings);
  } catch (err) {
    logError("❌ List bookings error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve bookings");
  }
}

// Get booking by ID
async function getBooking(req, res) {
  try {
    const { id } = req.params;
    const booking = await bookingService.getBookingById(id);
    successResponse(res, 200, "Booking retrieved successfully", booking);
  } catch (err) {
    logError("❌ Get booking error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to retrieve booking");
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
    errorResponse(res, err.statusCode || 500, err.message || "Failed to confirm payment");
  }
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  confirmPayment
};

