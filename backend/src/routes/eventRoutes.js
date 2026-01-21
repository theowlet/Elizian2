const express = require('express');
const eventController = require('../controllers/eventController');

const router = express.Router();

// Event taxonomy
router.get('/taxonomy', eventController.getTaxonomy);

// Event CRUD
router.get('/', eventController.listEvents);
router.post('/', eventController.createEvent);
router.get('/:id', eventController.getEvent);

// Event tickets
router.post('/:id/tickets', eventController.purchaseTicket);

module.exports = router;

