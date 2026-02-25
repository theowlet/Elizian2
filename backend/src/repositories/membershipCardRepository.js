const { getPool } = require('../config/db');
const pool = getPool();

/** NFT-ready metadata shape for future on-chain minting (OpenSea etc.) */
function buildNftMetadata(card) {
  const name = card.partner_name || 'Venue';
  const earnedAt = card.earned_at ? new Date(card.earned_at).toISOString() : null;
  return {
    token_id: String(card.id),
    name: `Venue Card: ${name}`,
    description: `Digital collectible earned by visiting ${name}. One card per venue.`,
    image: null,
    external_url: null,
    attributes: [
      { trait_type: 'Venue', value: name },
      { trait_type: 'Earned at', value: earnedAt || 'Unknown' },
      { trait_type: 'Card type', value: card.card_type || 'default' },
      { trait_type: 'Rarity', value: '1 of 1' },
    ],
  };
}

async function addCard({ userId, partnerId, cardType = 'default', metadata = {} }) {
  const result = await pool.query(
    `INSERT INTO user_venue_membership_cards (user_id, partner_id, card_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, partner_id) DO NOTHING
     RETURNING *`,
    [userId, partnerId, cardType, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

async function getCardsByUserId(userId, opts = {}) {
  const limit = Math.min(Math.max(1, parseInt(opts.limit, 10) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = Math.max(0, parseInt(opts.offset, 10) || 0);
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM user_venue_membership_cards WHERE user_id = $1`,
    [userId]
  );
  const total = countResult.rows[0]?.total ?? 0;
  const result = await pool.query(
    `SELECT c.*, p.name AS partner_name, NULL::text AS partner_image
     FROM user_venue_membership_cards c
     JOIN partners p ON p.id = c.partner_id
     WHERE c.user_id = $1
     ORDER BY c.earned_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const rows = (result.rows || []).map((row) => ({
    ...row,
    nft_metadata: buildNftMetadata(row),
  }));
  return { rows, total, limit, offset };
}

async function getCardByIdForUser(userId, cardId) {
  const result = await pool.query(
    `SELECT c.*, p.name AS partner_name, NULL::text AS partner_image
     FROM user_venue_membership_cards c
     JOIN partners p ON p.id = c.partner_id
     WHERE c.user_id = $1 AND c.id = $2
     LIMIT 1`,
    [userId, cardId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    nft_metadata: buildNftMetadata(row),
  };
}

async function getCardsByUserIdLegacy(userId) {
  const { rows } = await getCardsByUserId(userId, { limit: MAX_PAGE_SIZE, offset: 0 });
  return rows;
}

async function hasCard(userId, partnerId) {
  const result = await pool.query(
    `SELECT 1 FROM user_venue_membership_cards WHERE user_id = $1 AND partner_id = $2`,
    [userId, partnerId]
  );
  return result.rows.length > 0;
}

function isAllowedAvatarUrl(url) {
  if (url == null || String(url).trim() === '') return true;
  const u = String(url).trim();
  if (u.startsWith('data:')) return false;
  if (/base64/i.test(u)) return false;
  return u.startsWith('http://') || u.startsWith('https://');
}

async function updateCardAvatar(userId, cardId, payload) {
  const {
    avatar_type,
    avatar_original_url,
    avatar_display_url,
    avatar_filter_type,
    avatar_metadata
  } = payload || {};
  if (!isAllowedAvatarUrl(avatar_original_url) || !isAllowedAvatarUrl(avatar_display_url)) {
    throw new Error('Avatar URLs must be S3 or HTTPS; base64/data URLs are not allowed');
  }
  const result = await pool.query(
    `UPDATE user_venue_membership_cards
     SET avatar_type = $3, avatar_original_url = $4, avatar_display_url = $5,
         avatar_filter_type = $6, avatar_metadata = $7
     WHERE id = $2 AND user_id = $1
     RETURNING id, avatar_type, avatar_original_url, avatar_display_url, avatar_filter_type, avatar_metadata`,
    [
      userId,
      cardId,
      avatar_type || null,
      avatar_original_url || null,
      avatar_display_url || null,
      avatar_filter_type || null,
      avatar_metadata ? JSON.stringify(avatar_metadata) : null
    ]
  );
  return result.rows[0] || null;
}

module.exports = {
  addCard,
  getCardsByUserId,
  getCardsByUserIdLegacy,
  getCardByIdForUser,
  hasCard,
  updateCardAvatar,
};
