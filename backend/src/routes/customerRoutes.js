const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.get('/ecosystem-summary', authenticateToken, customerController.getEcosystemSummary);

module.exports = router;
