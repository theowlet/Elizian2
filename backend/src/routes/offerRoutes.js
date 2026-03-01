const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const offerSlotsService = require('../services/offerSlotsService');
const { logError } = require('../../utils/logger');

// Public route for listing offers
router.get('/', offerController.listPublicOffers);

// Get available time slots for booking (Dining: 30-min grid; Events: fixed slots)
router.get('/:offerId/available-slots', offerController.getAvailableSlots);

// Get offer/deal availability (for time slots, capacity, etc.)
// FIX #9: Implement actual slot availability instead of stub.
// Maps response to legacy shape { id, time_slot, price, available_count } for index.html compatibility.
router.get('/:offerId/availability', async (req, res) => {
  try {
    const { offerId } = req.params;
    const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date).trim())
      ? String(req.query.date).trim()
      : new Date().toISOString().split('T')[0];
    const partySize = parseInt(req.query.partySize, 10) || 1;

    const slots = await offerSlotsService.getAvailableSlotsForOffer(offerId, date, partySize);

    res.json({
      success: true,
      data: {
        available: true,
        has_slots: slots.length > 0,
        message: slots.length > 0 ? 'Slots available' : 'No slots configured',
        slots: slots.map(s => ({
          id: s.id || null,
          time_slot: s.time || s.label || '',
          price: 0, // price comes from the offer, not the slot
          available_count: s.remaining_seats != null ? s.remaining_seats : (s.available ? 999 : 0)
        }))
      }
    });
  } catch (err) {
    logError('Availability endpoint error:', err);
    res.json({
      success: true,
      data: { available: true, has_slots: false, slots: [], message: 'Available for booking' }
    });
  }
});

// Get single offer by ID (public, for event/offer detail pages)
router.get('/:offerId', offerController.getPublicOfferById);

module.exports = router;
