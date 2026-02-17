const express = require('express');
const promoCampaignController = require('../controllers/promoCampaignController');

const router = express.Router();
router.get('/active-campaigns', promoCampaignController.getActiveCampaigns);
module.exports = router;
