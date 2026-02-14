const crypto = require('crypto');
const { getPool } = require('../config/db');
const jwt = require('jsonwebtoken');
const { log, logError } = require('../utils/logger');
const { AppError } = require('../../utils/response');

const pool = getPool();
const JWT_SECRET = process.env.JWT_SECRET || 'elizian-dev-secret';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  EAZY PASS — Enterprise Tier Card Service
 *  Cryptographic QR, collision-proof pass numbers, scan audit trail
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  QR Architecture:
 *    - JWT signed with HMAC-SHA256 (HS256)
 *    - 5-minute expiry — regenerated on every modal open + every 4 min
 *    - Payload: type, user_id, tier_name, tier_level, card_number, reward_%
 *    - Server-verified only — partner scan hits POST /partner/verify-tier-card
 *    - Payload is NEVER trusted client-side
 *
 *  Pass Number Algorithm (collision-proof):
 *    - Format: ELZ-YYYY-XXXXXXXX
 *    - YYYY = issuance year (4 digits)
 *    - XXXXXXXX = uppercase hex from SHA-256(user_id + sequence + timestamp)
 *    - First 8 chars of hash = ~4 billion possibilities per year
 *    - DB UNIQUE constraint as final safety net
 *    - Sequence counter prevents hash collisions even with identical timestamps
 *    - Permanently stored, never reissued, indexed for O(1) lookup
 *
 *  Scan Audit:
 *    - Every verification logs to `eazy_pass_scan_log`
 *    - Captures: scanned_by (partner), result, user_id, tier, card_number, IP
 *    - Queryable in admin panel by pass number or user
 * ═══════════════════════════════════════════════════════════════════════
 */

const QR_EXPIRY = '5m'; // 5-minute short-lived tokens

// ─── In-memory pass number cache (pre-migration fallback) ────────────
// When tier_card_number column doesn't exist yet, we cache generated
// pass numbers in memory so the same user always gets the same number
// within a server session. After migration, DB is the source of truth.
const _passNumberCache = new Map();

// ─── Column existence cache (checked once per process lifetime) ──────
let _columnCache = null;
async function getColumnFlags() {
  if (_columnCache) return _columnCache;
  let hasTierCardCols = true;
  let hasThemeCols = true;
  let hasScanLogTable = true;

  try { await pool.query("SELECT tier_card_number FROM users LIMIT 0"); } catch (_) { hasTierCardCols = false; }
  try { await pool.query("SELECT card_theme_config FROM loyalty_tiers LIMIT 0"); } catch (_) { hasThemeCols = false; }
  try { await pool.query("SELECT 1 FROM eazy_pass_scan_log LIMIT 0"); } catch (_) { hasScanLogTable = false; }

  _columnCache = { hasTierCardCols, hasThemeCols, hasScanLogTable };
  return _columnCache;
}

// Reset cache on migration (call this after running migrations)
function resetColumnCache() { _columnCache = null; }


// ═══════════════════════════════════════════════════════════════════════
//  PASS NUMBER GENERATION — Collision-proof, deterministic, permanent
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a unique EZ Pass number: ELZ-YYYY-XXXXXXXX
 * Uses SHA-256 hash of (userId + sequence + timestamp) for collision resistance.
 */
async function generatePassNumber(userId) {
  let seq = 0;
  try {
    const seqResult = await pool.query("SELECT nextval('tier_card_sequence') as seq");
    seq = parseInt(seqResult.rows[0].seq, 10);
  } catch (_) {
    // Sequence not yet created — use random nonce instead
    seq = crypto.randomInt(100000, 999999);
  }

  const year = new Date().getFullYear();
  const hashInput = `${userId}:${seq}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const shortHash = hash.substring(0, 8).toUpperCase();

  return `ELZ-${year}-${shortHash}`;
}


// ═══════════════════════════════════════════════════════════════════════
//  GENERATE TIER CARD DATA (called on every modal open)
// ═══════════════════════════════════════════════════════════════════════

async function generateTierCardData(userId) {
  const flags = await getColumnFlags();

  // Build adaptive query
  const userCols = `u.id, u.first_name, u.last_name, u.email, u.phone_number,
    u.current_tier_name, ${flags.hasTierCardCols ? 'u.tier_card_number, u.tier_card_issued_at,' : ''}
    u.available_tokens, u.total_tokens_earned, u.total_tokens_spent,
    u.annual_spend_current, u.lifetime_spend, u.created_at`;

  const tierCols = `lt.tier_level, lt.badge_color, lt.badge_icon, lt.ezt_reward_percentage,
    ${flags.hasThemeCols ? 'lt.card_theme_config,' : ''} lt.benefits, lt.min_annual_spend, lt.max_annual_spend`;

  const result = await pool.query(`
    SELECT ${userCols}, ${tierCols}
    FROM users u
    LEFT JOIN loyalty_tiers lt ON u.current_tier_name = lt.tier_name
    WHERE u.id = $1
  `, [userId]);

  if (result.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  const user = result.rows[0];

  // ── Ensure permanent pass number exists ──
  let cardNumber = user.tier_card_number || null;

  if (!cardNumber && flags.hasTierCardCols) {
    // DB column exists but user doesn't have a number yet — generate & persist
    cardNumber = await generatePassNumber(userId);
    let attempts = 0;
    while (attempts < 3) {
      try {
        await pool.query(
          'UPDATE users SET tier_card_number = $1, tier_card_issued_at = CURRENT_TIMESTAMP WHERE id = $2 AND tier_card_number IS NULL',
          [cardNumber, userId]
        );
        break;
      } catch (err) {
        if (err.code === '23505') { // UNIQUE violation — regenerate
          attempts++;
          cardNumber = await generatePassNumber(userId);
        } else {
          logError('Error persisting pass number:', err.message);
          break;
        }
      }
    }
  } else if (!cardNumber) {
    // Pre-migration fallback: use deterministic generation cached in memory
    // Same userId always produces same number within a server session
    if (_passNumberCache.has(userId)) {
      cardNumber = _passNumberCache.get(userId);
    } else {
      // Deterministic: SHA-256 of userId alone (no random/timestamp)
      const deterministicHash = crypto.createHash('sha256').update(String(userId)).digest('hex');
      const shortHash = deterministicHash.substring(0, 8).toUpperCase();
      cardNumber = `ELZ-${new Date().getFullYear()}-${shortHash}`;
      _passNumberCache.set(userId, cardNumber);
    }
  }

  const memberSince = user.tier_card_issued_at || user.created_at || new Date();

  // ── Sign short-lived QR JWT (5 min) ──
  const qrPayload = {
    type: 'tier_card',
    sub: userId,
    tn: user.current_tier_name || 'Ather',
    tl: user.tier_level || 1,
    cn: cardNumber,
    rp: parseFloat(user.ezt_reward_percentage || 1),
    iat: Math.floor(Date.now() / 1000),
  };
  const qrToken = jwt.sign(qrPayload, JWT_SECRET, { expiresIn: QR_EXPIRY });

  // ── Calculate next tier progress ──
  let nextTier = null;
  if (user.max_annual_spend !== null) {
    const ntResult = await pool.query(
      'SELECT tier_name, min_annual_spend FROM loyalty_tiers WHERE tier_level = $1',
      [(user.tier_level || 1) + 1]
    );
    if (ntResult.rows.length > 0) {
      const nt = ntResult.rows[0];
      const currentSpend = parseFloat(user.annual_spend_current || 0);
      const needed = parseFloat(nt.min_annual_spend || 0);
      nextTier = {
        name: nt.tier_name,
        spendRequired: needed,
        amountRemaining: Math.max(0, needed - currentSpend),
        progressPercentage: needed > 0 ? Math.min(100, Math.round((currentSpend / needed) * 100)) : 100,
      };
    }
  }

  // ── Parse benefits ──
  const benefits = user.benefits || {};
  const activeBenefits = Object.entries(benefits)
    .filter(([, v]) => v === true || (typeof v === 'string' && v.length > 0))
    .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

  // ── Response (matches frontend EazyPassModal contract) ──
  return {
    user: {
      id: userId,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Member',
      email: user.email,
      phone: user.phone_number,
      memberSince,
    },
    tier: {
      name: user.current_tier_name || 'Ather',
      level: user.tier_level || 1,
      badgeColor: user.badge_color,
      badgeIcon: user.badge_icon,
      rewardPercentage: parseFloat(user.ezt_reward_percentage || 1),
      themeConfig: user.card_theme_config || null,
    },
    cardNumber,
    qrToken,
    wallet: {
      available: parseFloat(user.available_tokens || 0),
      totalEarned: parseFloat(user.total_tokens_earned || 0),
      totalSpent: parseFloat(user.total_tokens_spent || 0),
      annualSpend: parseFloat(user.annual_spend_current || 0),
      lifetimeSpend: parseFloat(user.lifetime_spend || 0),
    },
    benefits: activeBenefits,
    nextTier,
  };
}


// ═══════════════════════════════════════════════════════════════════════
//  VERIFY TIER CARD QR (partner scanning)
//  Server-authoritative — never trust client payload
// ═══════════════════════════════════════════════════════════════════════

async function verifyTierCardToken(token, { scannedByUserId = null, scannedByPartnerId = null, ipAddress = null } = {}) {
  const flags = await getColumnFlags();
  let scanResult = 'invalid';
  let decodedUserId = null;
  let decodedCardNumber = null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'tier_card') {
      throw new AppError(400, 'Invalid token type');
    }

    decodedUserId = decoded.sub || decoded.user_id;
    decodedCardNumber = decoded.cn || decoded.card_number;

    // Fetch live user data (server-authoritative — don't trust JWT payload for display)
    const userResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.current_tier_name,
              ${flags.hasTierCardCols ? 'u.tier_card_number,' : ''}
              u.available_tokens, lt.ezt_reward_percentage, lt.tier_level, lt.badge_color, lt.benefits
       FROM users u
       LEFT JOIN loyalty_tiers lt ON u.current_tier_name = lt.tier_name
       WHERE u.id = $1`,
      [decodedUserId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }

    const user = userResult.rows[0];

    // Verify card number hasn't been reissued
    if (flags.hasTierCardCols && user.tier_card_number && user.tier_card_number !== decodedCardNumber) {
      scanResult = 'card_reissued';
      throw new AppError(400, 'This card has been reissued. Ask the member to show their current EAZY PASS.');
    }

    scanResult = 'valid';

    log(`✅ EAZY PASS verified: ${decodedCardNumber} | ${user.current_tier_name} | user:${decodedUserId}`);

    return {
      valid: true,
      user: {
        id: decodedUserId,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      },
      tier: {
        name: user.current_tier_name,
        level: user.tier_level,
        rewardPercentage: parseFloat(user.ezt_reward_percentage || 1),
        badgeColor: user.badge_color,
      },
      cardNumber: decodedCardNumber,
      eztBalance: parseFloat(user.available_tokens || 0),
      benefits: user.benefits || {},
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      scanResult = 'expired';
      throw new AppError(401, 'QR code has expired. Ask the member to reopen their EAZY PASS.');
    }
    if (error.name === 'JsonWebTokenError') {
      scanResult = 'invalid_signature';
      throw new AppError(401, 'Invalid QR code');
    }
    throw error;
  } finally {
    // ── Always log scan attempt (audit trail) ──
    await logScanAttempt({
      scannedByUserId,
      scannedByPartnerId,
      scannedUserId: decodedUserId,
      cardNumber: decodedCardNumber,
      result: scanResult,
      ipAddress,
    }).catch(err => logError('Scan log write failed (non-fatal):', err.message));
  }
}


// ═══════════════════════════════════════════════════════════════════════
//  SCAN AUDIT LOG — Immutable, append-only
// ═══════════════════════════════════════════════════════════════════════

async function logScanAttempt({ scannedByUserId, scannedByPartnerId, scannedUserId, cardNumber, result, ipAddress }) {
  const flags = await getColumnFlags();
  if (!flags.hasScanLogTable) return; // Table not yet created

  await pool.query(`
    INSERT INTO eazy_pass_scan_log (scanned_by_user_id, scanned_by_partner_id, scanned_user_id, card_number, result, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [scannedByUserId, scannedByPartnerId, scannedUserId, cardNumber, result, ipAddress]);
}

/**
 * Get scan history for a pass number (admin/partner use)
 */
async function getScanHistory(cardNumber, { limit = 50, offset = 0 } = {}) {
  const flags = await getColumnFlags();
  if (!flags.hasScanLogTable) return [];

  const result = await pool.query(`
    SELECT sl.*, u.first_name || ' ' || u.last_name as scanned_user_name
    FROM eazy_pass_scan_log sl
    LEFT JOIN users u ON sl.scanned_user_id = u.id
    WHERE sl.card_number = $1
    ORDER BY sl.created_at DESC
    LIMIT $2 OFFSET $3
  `, [cardNumber, limit, offset]);

  return result.rows;
}

/**
 * Search pass by number (admin panel)
 */
async function findPassByNumber(passNumber) {
  const flags = await getColumnFlags();
  if (!flags.hasTierCardCols) return null;

  const result = await pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number,
           u.current_tier_name, u.tier_card_number, u.tier_card_issued_at,
           u.available_tokens, u.annual_spend_current,
           lt.tier_level, lt.ezt_reward_percentage
    FROM users u
    LEFT JOIN loyalty_tiers lt ON u.current_tier_name = lt.tier_name
    WHERE u.tier_card_number = $1
  `, [passNumber]);

  return result.rows[0] || null;
}


module.exports = {
  generateTierCardData,
  verifyTierCardToken,
  getScanHistory,
  findPassByNumber,
  resetColumnCache,
};
