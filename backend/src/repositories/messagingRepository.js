const { getPool } = require('../config/db');
const pool = getPool();

async function getOrCreateConversation(partnerId, userId) {
  let r = await pool.query(
    `SELECT id, partner_id, user_id, created_at, updated_at FROM venue_conversations WHERE partner_id = $1 AND user_id = $2`,
    [partnerId, userId]
  );
  if (r.rows[0]) return r.rows[0];
  r = await pool.query(
    `INSERT INTO venue_conversations (partner_id, user_id) VALUES ($1, $2) RETURNING id, partner_id, user_id, created_at, updated_at`,
    [partnerId, userId]
  );
  return r.rows[0];
}

async function getConversationById(conversationId) {
  const r = await pool.query(
    `SELECT id, partner_id, user_id, created_at, updated_at FROM venue_conversations WHERE id = $1`,
    [conversationId]
  );
  return r.rows[0];
}

async function listConversationsForPartner(partnerId) {
  const r = await pool.query(
    `SELECT c.id, c.partner_id, c.user_id, c.created_at, c.updated_at,
            u.first_name, u.last_name, u.email,
            (SELECT body FROM venue_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM venue_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
     FROM venue_conversations c
     JOIN users u ON u.id = c.user_id
     WHERE c.partner_id = $1
     ORDER BY c.updated_at DESC`,
    [partnerId]
  );
  return r.rows;
}

async function listConversationsForUser(userId) {
  const r = await pool.query(
    `SELECT c.id, c.partner_id, c.user_id, c.created_at, c.updated_at,
            p.name AS partner_name,
            (SELECT body FROM venue_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM venue_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
     FROM venue_conversations c
     JOIN partners p ON p.id = c.partner_id
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC`,
    [userId]
  );
  return r.rows;
}

async function listMessages(conversationId, limit = 100, beforeId = null) {
  let query = `SELECT id, conversation_id, sender_type, body, created_at FROM venue_messages WHERE conversation_id = $1`;
  const params = [conversationId];
  if (beforeId) {
    query += ` AND id < $2`;
    params.push(beforeId);
  }
  params.push(limit);
  query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const r = await pool.query(query, params);
  return r.rows.reverse();
}

async function addMessage(conversationId, senderType, body) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const msg = await client.query(
      `INSERT INTO venue_messages (conversation_id, sender_type, body) VALUES ($1, $2, $3) RETURNING *`,
      [conversationId, senderType, body.trim()]
    );
    await client.query(
      `UPDATE venue_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );
    await client.query('COMMIT');
    return msg.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getOrCreateConversation,
  getConversationById,
  listConversationsForPartner,
  listConversationsForUser,
  listMessages,
  addMessage,
};
