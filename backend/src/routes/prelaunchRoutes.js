const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const prelaunchController = require('../controllers/prelaunchController');
const router = express.Router();

router.get('/signups', authenticateToken, prelaunchController.listMine);

module.exports = router;
