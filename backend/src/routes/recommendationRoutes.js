const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const recommendationController = require('../controllers/recommendationController');
const recommendationService = require('../services/recommendationService');
const { successResponse, errorResponse } = require('../../utils/response');

const router = express.Router();

router.get('/offers', authenticateToken, recommendationController.getRecommendedOffers);

/**
 * @route   GET /api/v1/recommendations/preferences
 * @desc    Get user preferences for recommendations
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const pool = require('../config/db').getPool();
    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );
    successResponse(res, 200, 'Preferences retrieved', result.rows[0] || null);
  } catch (error) {
    // Graceful fallback if table doesn't exist
    successResponse(res, 200, 'No preferences set', null);
  }
});

/**
 * @route   PUT /api/v1/recommendations/preferences
 * @desc    Update user preferences for better recommendations
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { cuisine_preferences, preferred_occasions, preferred_time_of_day, price_range, dietary_restrictions } = req.body;
    await recommendationService.updateUserPreferences(req.userId, {
      cuisine_preferences,
      preferred_occasions,
      preferred_time_of_day,
      price_range,
      dietary_restrictions,
    });
    successResponse(res, 200, 'Preferences updated');
  } catch (error) {
    errorResponse(res, 500, 'Failed to update preferences');
  }
});

module.exports = router;
