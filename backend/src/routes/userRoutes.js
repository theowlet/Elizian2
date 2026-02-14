const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const authController = require('../../controllers/authController');
const membershipCardController = require('../controllers/membershipCardController');

const router = express.Router();

// User profile endpoint (requires authentication)
router.get('/profile', authenticateToken, authController.getProfile);

// Venue membership cards (Phase 3 #17 – digital collectibles per venue)
router.get('/membership-cards', authenticateToken, membershipCardController.getMyCards);

module.exports = router;

