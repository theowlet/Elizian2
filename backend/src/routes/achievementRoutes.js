const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

/**
 * @route   GET /api/v1/achievements
 * @desc    Get all available achievements
 * @access  Private
 */
router.get('/', authenticateToken, achievementController.getAllAchievements);

/**
 * @route   GET /api/v1/achievements/user
 * @desc    Get user's achievements
 * @access  Private
 */
router.get('/user', authenticateToken, achievementController.getUserAchievements);

/**
 * @route   POST /api/v1/achievements/check
 * @desc    Check and unlock new achievements
 * @access  Private
 */
router.post('/check', authenticateToken, achievementController.checkAchievements);

/**
 * @route   GET /api/v1/achievements/leaderboard
 * @desc    Get achievement leaderboard
 * @access  Private
 */
router.get('/leaderboard', authenticateToken, achievementController.getLeaderboard);

/**
 * @route   POST /api/v1/achievements
 * @desc    Create new achievement (admin only)
 * @access  Private/Admin
 */
router.post('/', authenticateToken, authorizeRole('admin'), achievementController.createAchievement);

/**
 * @route   POST /api/v1/achievements/unlock
 * @desc    Manually unlock achievement for user (admin only)
 * @access  Private/Admin
 */
router.post('/unlock', authenticateToken, authorizeRole('admin'), achievementController.unlockAchievementManually);

module.exports = router;

