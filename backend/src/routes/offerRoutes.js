const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');

// Public route for listing offers
router.get('/', offerController.listPublicOffers);

// Get offer/deal availability (for time slots, capacity, etc.)
// Returns availability information for booking UI
router.get('/:offerId/availability', (req, res) => {
  // For now, return default availability
  // This can be enhanced to check actual slot availability, capacity, etc.
  res.json({
    success: true,
    data: {
      available: true,
      message: 'Available for booking',
      slots: [] // Can be populated with actual time slots from deal_slots table
    }
  });
});

module.exports = router;

