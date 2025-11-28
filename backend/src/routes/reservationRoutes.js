const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationService');
const authenticateToken = require('../../middleware/authenticateToken');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

// Check availability for a date/time
router.get('/reservations/availability', async (req, res) => {
  try {
    const { partnerId, date, timeSlot } = req.query;
    
    if (!partnerId || !date || !timeSlot) {
      return errorResponse(res, 400, 'partnerId, date, and timeSlot are required');
    }

    const availability = await reservationService.checkAvailability(partnerId, date, timeSlot);
    successResponse(res, 200, 'Availability checked', availability);
  } catch (error) {
    logError('Error checking availability:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to check availability');
  }
});

// Get available time slots for a date
router.get('/reservations/time-slots', async (req, res) => {
  try {
    const { partnerId, date, partySize } = req.query;
    
    if (!partnerId || !date) {
      return errorResponse(res, 400, 'partnerId and date are required');
    }

    const slots = await reservationService.getAvailableTimeSlots(
      partnerId,
      date,
      partySize ? parseInt(partySize) : 2
    );
    successResponse(res, 200, 'Time slots retrieved', slots);
  } catch (error) {
    logError('Error getting time slots:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get time slots');
  }
});

// Create table reservation
router.post('/reservations', authenticateToken, async (req, res) => {
  try {
    const {
      bookingId,
      partnerId,
      reservationDate,
      reservationTime,
      partySize,
      occasion,
      specialRequests,
      seatingPreference
    } = req.body;

    if (!bookingId || !partnerId || !reservationDate || !reservationTime || !partySize) {
      return errorResponse(res, 400, 'Missing required fields: bookingId, partnerId, reservationDate, reservationTime, partySize');
    }

    const reservation = await reservationService.createReservation({
      booking_id: bookingId,
      partner_id: partnerId,
      user_id: req.userId,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: parseInt(partySize),
      occasion,
      special_requests: specialRequests,
      seating_preference: seatingPreference
    });

    successResponse(res, 201, 'Reservation created successfully', reservation);
  } catch (error) {
    logError('Error creating reservation:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to create reservation');
  }
});

// Get user reservations
router.get('/reservations', authenticateToken, async (req, res) => {
  try {
    const reservations = await reservationService.getUserReservations(req.userId);
    successResponse(res, 200, 'Reservations retrieved', reservations);
  } catch (error) {
    logError('Error getting reservations:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get reservations');
  }
});

// Get reservation by ID
router.get('/reservations/:id', authenticateToken, async (req, res) => {
  try {
    const reservation = await reservationService.getReservation(req.params.id);
    successResponse(res, 200, 'Reservation retrieved', reservation);
  } catch (error) {
    logError('Error getting reservation:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to get reservation');
  }
});

// Cancel reservation
router.post('/reservations/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const reservation = await reservationService.cancelReservation(
      req.params.id,
      reason || 'Cancelled by user'
    );
    successResponse(res, 200, 'Reservation cancelled', reservation);
  } catch (error) {
    logError('Error cancelling reservation:', error);
    errorResponse(res, error.statusCode || 500, error.message || 'Failed to cancel reservation');
  }
});

module.exports = router;

