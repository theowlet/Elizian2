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

// Update/Reschedule booking
router.put('/:id', authenticateToken, bookingController.updateBooking);

// Confirm payment
router.put('/:bookingId/confirm-payment', authenticateToken, bookingController.confirmPayment);

// QR-based check-in (must be before /:id/check-in so :id does not capture "qr-check-in")
router.post('/:id/qr-check-in', authenticateToken, bookingController.qrCheckIn);

// Consumer check-in at venue (visit session + 100m geofence)
router.post('/:id/check-in', authenticateToken, bookingController.checkInAtVenue);

module.exports = router;

