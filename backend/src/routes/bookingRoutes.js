const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const bookingController = require('../controllers/bookingController');

const router = express.Router();

// Create booking
router.post('/', authenticateToken, bookingController.createBooking);

// List bookings
router.get('/', authenticateToken, bookingController.listBookings);

// Get booking by ID
router.get('/:id', authenticateToken, bookingController.getBooking);

// Confirm payment
router.put('/:bookingId/confirm-payment', authenticateToken, bookingController.confirmPayment);

module.exports = router;

