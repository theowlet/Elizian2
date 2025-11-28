const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/authenticateToken');
const { requireRole } = require('../../middleware/rbac');
const rewardsController = require('../controllers/rewardsController');

// User endpoints (require authentication)
router.get('/summary', authenticateToken, rewardsController.getRewardsSummary);
router.get('/ezt/transactions', authenticateToken, rewardsController.getEZTTransactions);
router.get('/loyalty/transactions', authenticateToken, rewardsController.getLoyaltyTransactions);
router.get('/tier/history', authenticateToken, rewardsController.getTierHistory);

module.exports = router;

