const express = require('express');
const authenticateToken = require('../middleware/authenticateToken');
const loyaltyController = require('../controllers/loyaltyController');

const router = express.Router();

router.post('/calculate', authenticateToken, loyaltyController.calculate);
router.get('/progress', authenticateToken, loyaltyController.progress);
router.get('/history', authenticateToken, loyaltyController.history);

module.exports = router;

