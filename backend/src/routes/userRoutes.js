const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const authController = require('../../controllers/authController');
const membershipCardController = require('../controllers/membershipCardController');
const userVenueStatsController = require('../controllers/userVenueStatsController');

const router = express.Router();

// User profile endpoint (requires authentication)
router.get('/profile', authenticateToken, authController.getProfile);

// Venue membership cards (Phase 3 #17 – digital collectibles per venue)
router.get('/membership-cards', authenticateToken, membershipCardController.getMyCards);

// User's stats at a venue (visit count, EZT earned) for "You & this venue" block
router.get('/venue-stats/:partnerId', authenticateToken, userVenueStatsController.getVenueStats);

// User tip history
const tipController = require('../controllers/tipController');
router.get('/tips', authenticateToken, tipController.listByUser);

module.exports = router;

