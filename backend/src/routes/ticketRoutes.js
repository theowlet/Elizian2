const express = require('express');
const eventController = require('../controllers/eventController');

const router = express.Router();

// Ticket operations
router.get('/users/:id/tickets', eventController.getUserTickets);
router.post('/:ticketCode/checkin', eventController.checkInTicket);

module.exports = router;

