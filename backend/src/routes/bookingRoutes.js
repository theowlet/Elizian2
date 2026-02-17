const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const { checkOfferTierAccess } = require('../middleware/tierGate');
const bookingController = require('../controllers/bookingController');
const bookingValidation = require('../services/bookingValidation');
const { successResponse, errorResponse } = require('../utils/response');

const router = express.Router();

// Check booking availability (operating hours + capacity + Echelon override)
router.post('/check-availability', async (req, res) => {
  try {
    const { partner_id, booking_date, booking_time, party_size } = req.body;

    if (!partner_id || !booking_date || !booking_time) {
      return errorResponse(res, 400, 'partner_id, booking_date, and booking_time are required.');
    }

    // Get user tier if authenticated
    let user_tier = 'Ather';
    if (req.userId) {
      user_tier = await bookingValidation.getUserTier(req.userId);
    }

    const validation = await bookingValidation.validateBookingRequest({
      partner_id,
      user_id: req.userId,
      booking_date,
      booking_time,
      party_size: party_size || 1,
      user_tier
    });

    return successResponse(res, 200, 'Success', {
      canBook: validation.allowed,
      canWaitlist: validation.can_waitlist || false,
      reason: validation.reason,
      message: validation.message,
      waitlistInfo: validation.waitlist_info || null,
      overrideUsed: validation.override_used || false
    });
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
});

// Create booking (tier-gate: reject if offer requires higher tier than user has)
router.post('/', authenticateToken, checkOfferTierAccess, bookingController.createBooking);

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

// Waitlist management (user-facing)
const waitlistController = require('../controllers/waitlistController');
router.post('/waitlist/join', authenticateToken, waitlistController.joinWaitlist);
router.get('/waitlist/my-entries', authenticateToken, waitlistController.getMyWaitlistEntries);
router.delete('/waitlist/:id', authenticateToken, waitlistController.cancelWaitlistEntry);
router.post('/waitlist/expire-notifications', waitlistController.expireNotifications); // Cron job endpoint

module.exports = router;

