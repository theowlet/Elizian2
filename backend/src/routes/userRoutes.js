const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const authController = require('../../controllers/authController');

const router = express.Router();

// User profile endpoint (requires authentication)
router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;

