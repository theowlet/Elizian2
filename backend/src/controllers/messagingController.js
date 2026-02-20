const messagingRepository = require('../repositories/messagingRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { emitToRoom } = require('../utils/realtimeEmitter');

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function getConversationId(req) {
  return req.params.conversationId || req.params.id;
}

// ═══════════════════════════════════════════════════════════════════════
//  CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════

async function getOrCreateWithPartner(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const partnerId = req.params.id || req.params.partnerId;
    if (!partnerId) return errorResponse(res, 400, 'Partner id required');
    const conv = await messagingRepository.getOrCreateConversation(partnerId, userId);
    successResponse(res, 200, 'Conversation retrieved', conv);
  } catch (err) {
    logError('Get/create conversation error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function listMyConversations(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const list = await messagingRepository.listConversationsForUser(userId);
    successResponse(res, 200, 'Conversations retrieved', list);
  } catch (err) {
    logError('List conversations error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function listPartnerConversations(req, res) {
  try {
    const { id: partnerId } = req.params;
    if (!req.partnerId || !sameId(req.partnerId, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const list = await messagingRepository.listConversationsForPartner(partnerId);
    successResponse(res, 200, 'Conversations retrieved', list);
  } catch (err) {
    logError('List partner conversations error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════════════════════════════════

async function getMessages(req, res) {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) return errorResponse(res, 400, 'Conversation id required');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && sameId(conv.user_id, req.userId);
    const isPartner = req.partnerId && sameId(conv.partner_id, req.partnerId);
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');

    const messages = await messagingRepository.listMessages(conversationId);
    log(`[Messaging] getMessages conversationId=${conversationId} count=${messages.length}`);

    // Auto-mark messages as delivered when fetched
    const readerType = isPartner ? 'partner' : 'user';
    await messagingRepository.markAsDelivered(conversationId, readerType).catch(() => {});

    // Stable contract for frontend + backward compatibility
    return res.status(200).json({
      success: true,
      message: 'Messages retrieved',
      conversation: conv,
      messages: messages || [],
      data: { conversation: conv, messages: messages || [] },
    });
  } catch (err) {
    logError('Get messages error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function sendMessage(req, res) {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) return errorResponse(res, 400, 'Conversation id required');
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) return errorResponse(res, 400, 'Message body required');
    if (body.trim().length > 2000) return errorResponse(res, 400, 'Message too long (max 2000 characters)');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && sameId(conv.user_id, req.userId);
    const isPartner = req.partnerId && sameId(conv.partner_id, req.partnerId);
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');
    const senderType = isPartner ? 'partner' : 'user';
    const msg = await messagingRepository.addMessage(conversationId, senderType, body.trim());
    if (senderType === 'partner' && conv.user_id) {
      emitToRoom(`users:${conv.user_id}`, 'message_received', { conversationId: conv.id, message: msg });
    }
    successResponse(res, 201, 'Message sent', msg);
  } catch (err) {
    logError('Send message error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PARTNER-SCOPED ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

async function getMessagesForPartner(req, res) {
  try {
    const { id: partnerId, conversationId } = req.params;
    if (!req.partnerId || !sameId(req.partnerId, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    if (!sameId(conv.partner_id, partnerId)) return errorResponse(res, 403, 'Not authorized');

    const messages = await messagingRepository.listMessages(conversationId);
    log(`[Messaging] getMessagesForPartner partnerId=${partnerId} conversationId=${conversationId} count=${messages.length}`);

    // Auto-mark as delivered when partner fetches
    await messagingRepository.markAsDelivered(conversationId, 'partner').catch(() => {});

    // Stable contract for frontend + backward compatibility
    return res.status(200).json({
      success: true,
      message: 'Messages retrieved',
      conversation: conv,
      messages: messages || [],
      data: { conversation: conv, messages: messages || [] },
    });
  } catch (err) {
    logError('Get messages for partner error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function sendMessageForPartner(req, res) {
  try {
    const { id: partnerId, conversationId } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) return errorResponse(res, 400, 'Message body required');
    if (body.trim().length > 2000) return errorResponse(res, 400, 'Message too long (max 2000 characters)');
    if (!req.partnerId || !sameId(req.partnerId, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    if (!sameId(conv.partner_id, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const msg = await messagingRepository.addMessage(conversationId, 'partner', body.trim());
    if (conv.user_id) {
      emitToRoom(`users:${conv.user_id}`, 'message_received', { conversationId: conv.id, message: msg });
    }
    successResponse(res, 201, 'Message sent', msg);
  } catch (err) {
    logError('Send message for partner error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  READ RECEIPTS
// ═══════════════════════════════════════════════════════════════════════

async function markRead(req, res) {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) return errorResponse(res, 400, 'Conversation id required');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && sameId(conv.user_id, req.userId);
    const isPartner = req.partnerId && sameId(conv.partner_id, req.partnerId);
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');
    const readerType = isPartner ? 'partner' : 'user';
    const result = await messagingRepository.markAsRead(conversationId, readerType);
    successResponse(res, 200, 'Messages marked as read', result);
  } catch (err) {
    logError('Mark read error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function markReadForPartner(req, res) {
  try {
    const { id: partnerId, conversationId } = req.params;
    if (!req.partnerId || !sameId(req.partnerId, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    if (!sameId(conv.partner_id, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const result = await messagingRepository.markAsRead(conversationId, 'partner');
    successResponse(res, 200, 'Messages marked as read', result);
  } catch (err) {
    logError('Mark read for partner error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  DELETE MESSAGE
// ═══════════════════════════════════════════════════════════════════════

async function deleteMessageHandler(req, res) {
  try {
    const conversationId = getConversationId(req);
    const { messageId } = req.params;
    if (!conversationId) return errorResponse(res, 400, 'Conversation id required');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && sameId(conv.user_id, req.userId);
    const isPartner = req.partnerId && sameId(conv.partner_id, req.partnerId);
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');
    const deleterType = isPartner ? 'partner' : 'user';
    const result = await messagingRepository.deleteMessage(messageId, deleterType);
    if (!result.success) return errorResponse(res, 400, result.reason);
    successResponse(res, 200, 'Message deleted', result);
  } catch (err) {
    logError('Delete message error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  UNREAD COUNTS
// ═══════════════════════════════════════════════════════════════════════

async function getUnreadCount(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const count = await messagingRepository.getUnreadCountForUser(userId);
    successResponse(res, 200, 'Unread count retrieved', { unread: count });
  } catch (err) {
    logError('Unread count error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function getUnreadCountPartner(req, res) {
  try {
    const { id: partnerId } = req.params;
    if (!req.partnerId || !sameId(req.partnerId, partnerId)) return errorResponse(res, 403, 'Not authorized');
    const count = await messagingRepository.getUnreadCountForPartner(partnerId);
    successResponse(res, 200, 'Unread count retrieved', { unread: count });
  } catch (err) {
    logError('Partner unread count error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

module.exports = {
  getOrCreateWithPartner,
  listMyConversations,
  listPartnerConversations,
  getMessages,
  sendMessage,
  getMessagesForPartner,
  sendMessageForPartner,
  markRead,
  markReadForPartner,
  deleteMessageHandler,
  getUnreadCount,
  getUnreadCountPartner,
};
