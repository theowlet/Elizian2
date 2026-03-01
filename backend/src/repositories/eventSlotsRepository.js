/**
 * Event Slots Repository
 * Manages fixed slots for events deals (e.g. Laughter club 7PM 2h, Musical 8PM 3h)
 */

const { getPool } = require('../config/db');
const pool = getPool();

async function tableExists(client = pool) {
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_slots'`
    );
    return r.rows.length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * List event slots for an offer
 */
async function listByOffer(offerId, client = pool) {
  const exists = await tableExists(client);
  if (!exists) return [];

  const result = await client.query(
    `SELECT id, offer_id, slot_time, duration_minutes, capacity, label, display_order
     FROM event_slots
     WHERE offer_id = $1
     ORDER BY display_order, slot_time`,
    [offerId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    offer_id: r.offer_id,
    slot_time: String(r.slot_time).substring(0, 5),
    duration_minutes: r.duration_minutes,
    capacity: r.capacity,
    label: r.label,
    display_order: r.display_order
  }));
}

/**
 * Replace all event slots for an offer. Pass array of { slot_time, duration_minutes, capacity, label }
 */
async function upsertForOffer(offerId, slots, client = pool) {
  const exists = await tableExists(client);
  if (!exists) return;

  await client.query(`DELETE FROM event_slots WHERE offer_id = $1`, [offerId]);

  if (!Array.isArray(slots) || slots.length === 0) return;

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const slotTime = String(s.slot_time || '').trim().substring(0, 5);
    if (!slotTime || !/^\d{1,2}:\d{2}$/.test(slotTime)) continue;
    const duration = Math.max(1, Math.min(480, parseInt(s.duration_minutes, 10) || 120));
    const capacity = Math.max(1, parseInt(s.capacity, 10) || 50);
    const label = (s.label || '').trim().substring(0, 100) || null;

    await client.query(
      `INSERT INTO event_slots (offer_id, slot_time, duration_minutes, capacity, label, display_order, updated_at)
       VALUES ($1, $2::time, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [offerId, slotTime, duration, capacity, label, i]
    );
  }
}

module.exports = {
  tableExists,
  listByOffer,
  upsertForOffer
};
