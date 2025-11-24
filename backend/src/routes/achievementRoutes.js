const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const authenticateToken = require('../../middleware/authenticateToken');
const { requireRole } = require('../../middleware/rbac');

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
router.post('/', authenticateToken, requireRole('super_admin', 'admin'), achievementController.createAchievement);

/**
 * @route   POST /api/v1/achievements/unlock
 * @desc    Manually unlock achievement for user (admin only)
 * @access  Private/Admin
 */
router.post('/unlock', authenticateToken, requireRole('super_admin', 'admin'), achievementController.unlockAchievementManually);

module.exports = router;

