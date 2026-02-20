const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');
const pool = getPool();

// ═══════════════════════════════════════════════════════════════════════
//  COLUMN EXISTENCE CACHE — checked once per process
// ═══════════════════════════════════════════════════════════════════════
let _hasNewCols = null;
const REQUIRED_MESSAGE_COLS = ['status', 'delivered_at', 'read_at', 'deleted_at', 'deleted_by'];
const REQUIRED_CONVERSATION_COLS = ['user_last_read_at', 'partner_last_read_at'];

async function hasMessagingUpgrade() {
  if (_hasNewCols !== null) return _hasNewCols;
  try {
    const msgCols = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'venue_messages'`
    );
    const convCols = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'venue_conversations'`
    );

    const msgSet = new Set(msgCols.rows.map((r) => r.column_name));
    const convSet = new Set(convCols.rows.map((r) => r.column_name));
    const missing = [
      ...REQUIRED_MESSAGE_COLS
        .filter((col) => !msgSet.has(col))
        .map((col) => `venue_messages.${col}`),
      ...REQUIRED_CONVERSATION_COLS
        .filter((col) => !convSet.has(col))
        .map((col) => `venue_conversations.${col}`),
    ];

    _hasNewCols = missing.length === 0;
    if (process.env.DEBUG_MESSAGING === 'true') {
      log(`[MessagingRepo] hasMessagingUpgrade=${_hasNewCols}${missing.length ? ` missing=${missing.join(',')}` : ''}`);
    }
  } catch (err) {
    _hasNewCols = false;
    logError('[MessagingRepo] hasMessagingUpgrade check failed', err);
  }
  return _hasNewCols;
}

// ═══════════════════════════════════════════════════════════════════════
//  CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════

async function getOrCreateConversation(partnerId, userId) {
  // Use ON CONFLICT to prevent race condition
  const r = await pool.query(
    `INSERT INTO venue_conversations (partner_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (partner_id, user_id) DO UPDATE SET updated_at = venue_conversations.updated_at
     RETURNING id, partner_id, user_id, created_at, updated_at`,
    [partnerId, userId]
  );
  return r.rows[0];
}

async function getConversationById(conversationId) {
  const r = await pool.query(
    `SELECT id, partner_id, user_id, created_at, updated_at FROM venue_conversations WHERE id = $1`,
    [conversationId]
  );
  if (process.env.DEBUG_MESSAGING === 'true') {
    log(`[MessagingRepo] getConversationById conversationId=${conversationId} found=${r.rowCount > 0}`);
  }
  return r.rows[0];
}

async function listConversationsForPartner(partnerId) {
  const upgraded = await hasMessagingUpgrade();
  const unreadSubquery = upgraded
    ? `, (SELECT COUNT(*) FROM venue_messages vm
         WHERE vm.conversation_id = c.id
           AND vm.sender_type = 'user'
           AND vm.status != 'read'
           AND vm.deleted_at IS NULL) AS unread_count`
    : ', 0 AS unread_count';

  const r = await pool.query(
    `SELECT c.id, c.partner_id, c.user_id, c.created_at, c.updated_at,
            u.first_name, u.last_name, u.email,
            (SELECT body FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT sender_type FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message_sender
            ${unreadSubquery}
     FROM venue_conversations c
     JOIN users u ON u.id = c.user_id
     WHERE c.partner_id = $1
     ORDER BY c.updated_at DESC`,
    [partnerId]
  );
  return r.rows;
}

async function listConversationsForUser(userId) {
  const upgraded = await hasMessagingUpgrade();
  const unreadSubquery = upgraded
    ? `, (SELECT COUNT(*) FROM venue_messages vm
         WHERE vm.conversation_id = c.id
           AND vm.sender_type = 'partner'
           AND vm.status != 'read'
           AND vm.deleted_at IS NULL) AS unread_count`
    : ', 0 AS unread_count';

  const r = await pool.query(
    `SELECT c.id, c.partner_id, c.user_id, c.created_at, c.updated_at,
            p.name AS partner_name,
            (SELECT body FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT sender_type FROM venue_messages WHERE conversation_id = c.id ${upgraded ? 'AND deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1) AS last_message_sender
            ${unreadSubquery}
     FROM venue_conversations c
     JOIN partners p ON p.id = c.partner_id
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC`,
    [userId]
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════════════════════════════════

async function listMessages(conversationId, limit = 100, beforeId = null) {
  const upgraded = await hasMessagingUpgrade();
  const deletedFilter = upgraded ? ' AND deleted_at IS NULL' : '';

  let query = `SELECT id, conversation_id, sender_type, body, created_at
    ${upgraded ? ', status, delivered_at, read_at, deleted_at' : ''}
    FROM venue_messages WHERE conversation_id = $1${deletedFilter}`;
  const params = [conversationId];

  if (beforeId) {
    query += ` AND created_at < (SELECT created_at FROM venue_messages WHERE id = $${params.length + 1})`;
    params.push(beforeId);
  }
  params.push(limit);
  query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const r = await pool.query(query, params);
  if (process.env.DEBUG_MESSAGING === 'true') {
    log(`[MessagingRepo] listMessages conversationId=${conversationId} rows=${r.rowCount} upgraded=${upgraded}`);
  }

  // Keep response shape stable even before whatsapp-upgrade migration
  const normalized = r.rows.map((row) => ({
    ...row,
    status: row.status || 'sent',
    delivered_at: row.delivered_at || null,
    read_at: row.read_at || null,
  }));
  return normalized.reverse();
}

async function addMessage(conversationId, senderType, body) {
  const upgraded = await hasMessagingUpgrade();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertCols = upgraded
      ? '(conversation_id, sender_type, body, status)'
      : '(conversation_id, sender_type, body)';
    const insertVals = upgraded
      ? '($1, $2, $3, \'sent\')'
      : '($1, $2, $3)';
    const returnCols = upgraded
      ? 'id, conversation_id, sender_type, body, created_at, status, delivered_at, read_at'
      : 'id, conversation_id, sender_type, body, created_at';

    const msg = await client.query(
      `INSERT INTO venue_messages ${insertCols} VALUES ${insertVals} RETURNING ${returnCols}`,
      [conversationId, senderType, body.trim()]
    );
    await client.query(
      `UPDATE venue_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );
    await client.query('COMMIT');
    if (process.env.DEBUG_MESSAGING === 'true') {
      log(`[MessagingRepo] addMessage conversationId=${conversationId} sender=${senderType} messageId=${msg.rows[0]?.id}`);
    }
    return {
      ...msg.rows[0],
      status: msg.rows[0]?.status || 'sent',
      delivered_at: msg.rows[0]?.delivered_at || null,
      read_at: msg.rows[0]?.read_at || null,
    };
  } catch (e) {
    logError('[MessagingRepo] addMessage failed', e);
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  READ RECEIPTS — Mark messages as read
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mark all unread messages FROM the other party as 'read'.
 * Called when a participant opens a conversation.
 * @param {string} conversationId
 * @param {string} readerType - 'user' or 'partner' (who is reading)
 */
async function markAsRead(conversationId, readerType) {
  const upgraded = await hasMessagingUpgrade();
  if (!upgraded) return { count: 0 };

  // Messages sent by the OTHER party that are not yet read
  const senderType = readerType === 'user' ? 'partner' : 'user';
  const now = new Date().toISOString();

  const r = await pool.query(
    `UPDATE venue_messages
     SET status = 'read', read_at = $1, delivered_at = COALESCE(delivered_at, $1)
     WHERE conversation_id = $2
       AND sender_type = $3
       AND status != 'read'
       AND deleted_at IS NULL
     RETURNING id`,
    [now, conversationId, senderType]
  );

  // Update last_read_at on conversation
  const lastReadCol = readerType === 'user' ? 'user_last_read_at' : 'partner_last_read_at';
  await pool.query(
    `UPDATE venue_conversations SET ${lastReadCol} = $1 WHERE id = $2`,
    [now, conversationId]
  );

  return { count: r.rowCount };
}

/**
 * Mark messages as delivered (when recipient's device polls/connects)
 */
async function markAsDelivered(conversationId, recipientType) {
  const upgraded = await hasMessagingUpgrade();
  if (!upgraded) return { count: 0 };

  const senderType = recipientType === 'user' ? 'partner' : 'user';
  const now = new Date().toISOString();

  const r = await pool.query(
    `UPDATE venue_messages
     SET status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
         delivered_at = COALESCE(delivered_at, $1)
     WHERE conversation_id = $2
       AND sender_type = $3
       AND status = 'sent'
       AND deleted_at IS NULL
     RETURNING id`,
    [now, conversationId, senderType]
  );
  return { count: r.rowCount };
}

// ═══════════════════════════════════════════════════════════════════════
//  DELETE MESSAGE — Only sender can delete, only before recipient reads
// ═══════════════════════════════════════════════════════════════════════

/**
 * Soft-delete a message. Rules:
 * - Only the sender can delete their own message
 * - Can only delete if the message hasn't been read yet
 * - Soft delete: sets deleted_at and deleted_by
 */
async function deleteMessage(messageId, deleterType) {
  const upgraded = await hasMessagingUpgrade();
  if (!upgraded) return { success: false, reason: 'Feature not available' };

  // First check the message exists and belongs to the deleter
  const msg = await pool.query(
    `SELECT id, sender_type, status, deleted_at FROM venue_messages WHERE id = $1`,
    [messageId]
  );
  if (!msg.rows[0]) return { success: false, reason: 'Message not found' };
  const m = msg.rows[0];

  if (m.deleted_at) return { success: false, reason: 'Message already deleted' };
  if (m.sender_type !== deleterType) return { success: false, reason: 'Only the sender can delete a message' };
  if (m.status === 'read') return { success: false, reason: 'Cannot delete a message that has been read' };

  await pool.query(
    `UPDATE venue_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2`,
    [deleterType, messageId]
  );
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  UNREAD COUNTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get total unread count across all conversations for a user
 */
async function getUnreadCountForUser(userId) {
  const upgraded = await hasMessagingUpgrade();
  if (!upgraded) return 0;

  const r = await pool.query(
    `SELECT COUNT(*) as count FROM venue_messages vm
     JOIN venue_conversations vc ON vc.id = vm.conversation_id
     WHERE vc.user_id = $1
       AND vm.sender_type = 'partner'
       AND vm.status != 'read'
       AND vm.deleted_at IS NULL`,
    [userId]
  );
  return parseInt(r.rows[0].count, 10);
}

/**
 * Get total unread count across all conversations for a partner
 */
async function getUnreadCountForPartner(partnerId) {
  const upgraded = await hasMessagingUpgrade();
  if (!upgraded) return 0;

  const r = await pool.query(
    `SELECT COUNT(*) as count FROM venue_messages vm
     JOIN venue_conversations vc ON vc.id = vm.conversation_id
     WHERE vc.partner_id = $1
       AND vm.sender_type = 'user'
       AND vm.status != 'read'
       AND vm.deleted_at IS NULL`,
    [partnerId]
  );
  return parseInt(r.rows[0].count, 10);
}

module.exports = {
  getOrCreateConversation,
  getConversationById,
  listConversationsForPartner,
  listConversationsForUser,
  listMessages,
  addMessage,
  markAsRead,
  markAsDelivered,
  deleteMessage,
  getUnreadCountForUser,
  getUnreadCountForPartner,
};
