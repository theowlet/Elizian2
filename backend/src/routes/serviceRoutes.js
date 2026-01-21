const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

// Public routes for service types and categories
router.get('/service-types', serviceController.getServiceTypes);
router.get('/service-categories', serviceController.getServiceCategories);

module.exports = router;

