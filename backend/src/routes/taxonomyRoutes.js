const express = require('express');
const taxonomyController = require('../controllers/taxonomyController');

const router = express.Router();

// Public: get taxonomy tree for a service type
// GET /api/v1/taxonomy?service_type=dining[&partner_id=uuid]
router.get('/taxonomy', taxonomyController.getTaxonomyByServiceType);

// Public: autocomplete item name suggestions for a taxonomy node
// GET /api/v1/taxonomy/:id/items/suggestions
router.get('/taxonomy/:id/items/suggestions', taxonomyController.getItemSuggestions);

module.exports = router;
