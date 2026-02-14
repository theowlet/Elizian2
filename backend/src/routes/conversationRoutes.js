const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const messagingController = require('../controllers/messagingController');
const router = express.Router();

// List all conversations for the authenticated user
router.get('/', authenticateToken, messagingController.listMyConversations);

// Get unread message count for the authenticated user
router.get('/unread', authenticateToken, messagingController.getUnreadCount);

// Get messages in a conversation
router.get('/:id/messages', authenticateToken, messagingController.getMessages);

// Send a message in a conversation
router.post('/:id/messages', authenticateToken, messagingController.sendMessage);

// Mark all messages in a conversation as read
router.post('/:id/read', authenticateToken, messagingController.markRead);

// Delete a specific message (soft delete, sender only, before read)
router.delete('/:id/messages/:messageId', authenticateToken, messagingController.deleteMessageHandler);

module.exports = router;
