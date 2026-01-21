const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const authenticateToken = require('../../middleware/authenticateToken');

/**
 * @route   GET /api/v1/referrals/validate/:code
 * @desc    Validate referral code (public)
 * @access  Public
 */
router.get('/validate/:code', referralController.validateReferralCode);

/**
 * @route   GET /api/v1/referrals/code
 * @desc    Get or create user's referral code
 * @access  Private
 */
router.get('/code', authenticateToken, referralController.getReferralCode);

/**
 * @route   GET /api/v1/referrals/stats
 * @desc    Get referral statistics
 * @access  Private
 */
router.get('/stats', authenticateToken, referralController.getReferralStats);

/**
 * @route   GET /api/v1/referrals/history
 * @desc    Get referral history
 * @access  Private
 */
router.get('/history', authenticateToken, referralController.getReferralHistory);

/**
 * @route   GET /api/v1/referrals/leaderboard
 * @desc    Get referral leaderboard
 * @access  Private
 */
router.get('/leaderboard', authenticateToken, referralController.getLeaderboard);

module.exports = router;

