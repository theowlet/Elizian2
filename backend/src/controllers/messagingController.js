const messagingRepository = require('../repositories/messagingRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

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
    if (!req.partnerId || req.partnerId !== partnerId) return errorResponse(res, 403, 'Not authorized');
    const list = await messagingRepository.listConversationsForPartner(partnerId);
    successResponse(res, 200, 'Conversations retrieved', list);
  } catch (err) {
    logError('List partner conversations error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function getMessages(req, res) {
  try {
    const { id: conversationId } = req.params;
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && conv.user_id === req.userId;
    const isPartner = req.partnerId && conv.partner_id === req.partnerId;
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');
    const messages = await messagingRepository.listMessages(conversationId);
    successResponse(res, 200, 'Messages retrieved', { conversation: conv, messages });
  } catch (err) {
    logError('Get messages error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

async function sendMessage(req, res) {
  try {
    const { id: conversationId } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== 'string' || !body.trim()) return errorResponse(res, 400, 'Message body required');
    const conv = await messagingRepository.getConversationById(conversationId);
    if (!conv) return errorResponse(res, 404, 'Conversation not found');
    const isUser = req.userId && conv.user_id === req.userId;
    const isPartner = req.partnerId && conv.partner_id === req.partnerId;
    if (!isUser && !isPartner) return errorResponse(res, 403, 'Not authorized');
    const senderType = isPartner ? 'partner' : 'user';
    const msg = await messagingRepository.addMessage(conversationId, senderType, body.trim());
    successResponse(res, 201, 'Message sent', msg);
  } catch (err) {
    logError('Send message error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed');
  }
}

module.exports = {
  getOrCreateWithPartner,
  listMyConversations,
  listPartnerConversations,
  getMessages,
  sendMessage,
};
