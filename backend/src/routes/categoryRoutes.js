const express = require('express');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

// Public routes
router.get('/', categoryController.listCategories);

module.exports = router;

