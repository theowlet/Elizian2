const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const messagingController = require('../controllers/messagingController');
const router = express.Router();

router.get('/', authenticateToken, messagingController.listMyConversations);
router.get('/:id/messages', authenticateToken, messagingController.getMessages);
router.post('/:id/messages', authenticateToken, messagingController.sendMessage);

module.exports = router;
