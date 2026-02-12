const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const subscriptionPassController = require('../controllers/subscriptionPassController');
const router = express.Router();

router.get('/products', subscriptionPassController.listProducts);
router.get('/me', authenticateToken, subscriptionPassController.listMyPasses);
router.post('/claim', authenticateToken, subscriptionPassController.claim);

module.exports = router;
