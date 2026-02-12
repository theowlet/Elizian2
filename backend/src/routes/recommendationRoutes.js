const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const recommendationController = require('../controllers/recommendationController');

const router = express.Router();

router.get('/offers', authenticateToken, recommendationController.getRecommendedOffers);

module.exports = router;
