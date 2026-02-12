const { getPool } = require('../config/db');
const pool = getPool();

async function listByPartner(partnerId, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT id, partner_id, title, body, segment_filter, scheduled_at, sent_at, status, created_at
     FROM partner_notification_campaigns
     WHERE partner_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [partnerId, limit, offset]
  );
  return result.rows;
}

async function getByIdAndPartner(campaignId, partnerId) {
  const result = await pool.query(
    `SELECT * FROM partner_notification_campaigns WHERE id = $1 AND partner_id = $2`,
    [campaignId, partnerId]
  );
  return result.rows[0];
}

async function create(partnerId, { title, body, segment_filter, scheduled_at, status = 'draft' }) {
  const result = await pool.query(
    `INSERT INTO partner_notification_campaigns (partner_id, title, body, segment_filter, scheduled_at, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      partnerId,
      title,
      body,
      segment_filter ? JSON.stringify(segment_filter) : null,
      scheduled_at || null,
      status,
    ]
  );
  return result.rows[0];
}

async function update(campaignId, partnerId, { title, body, segment_filter, scheduled_at, status }) {
  const updates = [];
  const values = [];
  let i = 1;
  if (title !== undefined) {
    updates.push(`title = $${i++}`);
    values.push(title);
  }
  if (body !== undefined) {
    updates.push(`body = $${i++}`);
    values.push(body);
  }
  if (segment_filter !== undefined) {
    updates.push(`segment_filter = $${i++}`);
    values.push(segment_filter ? JSON.stringify(segment_filter) : null);
  }
  if (scheduled_at !== undefined) {
    updates.push(`scheduled_at = $${i++}`);
    values.push(scheduled_at || null);
  }
  if (status !== undefined) {
    updates.push(`status = $${i++}`);
    values.push(status);
  }
  if (updates.length === 0) {
    return getByIdAndPartner(campaignId, partnerId);
  }
  values.push(campaignId, partnerId);
  const result = await pool.query(
    `UPDATE partner_notification_campaigns SET ${updates.join(', ')}
     WHERE id = $${i} AND partner_id = $${i + 1}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

async function setSent(campaignId, partnerId) {
  const result = await pool.query(
    `UPDATE partner_notification_campaigns
     SET status = 'sent', sent_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND partner_id = $2 AND status IN ('draft', 'scheduled')
     RETURNING *`,
    [campaignId, partnerId]
  );
  return result.rows[0];
}

module.exports = {
  listByPartner,
  getByIdAndPartner,
  create,
  update,
  setSent,
};
