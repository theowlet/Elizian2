const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');
const { emitRealtimeEvent, emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');

const pool = getPool();

/** EZT balance can go down to -10 (app loans up to 10 EZT). No redemption blocked for insufficient EZT within this limit. */
const EZT_OVERDRAFT_LIMIT = 10;

/** Get overdraft limit (for wallet-cap calculations in redemption/tip). */
const getOverdraftLimit = () => EZT_OVERDRAFT_LIMIT;

// Award EZT tokens: loyalty = tier % of fiat spent → EZT = (fiat × tier_pct) / 1000 (e.g. 1% of ₹2800 = 2.8 EZT)
// ENTERPRISE FIX: Reward percentage is ALWAYS fetched from loyalty_tiers DB table (never hardcoded)
const awardTokens = async (userId, amountSpent, transactionId = null, description = '') => {
  try {
    // Idempotency check: if this transaction already awarded, return cached amount
    if (transactionId) {
      const existingLedger = await pool.query(
        `SELECT id, amount FROM token_ledger
         WHERE user_id = $1 AND reference_id = $2 AND ledger_type = 'earned'`,
        [userId, String(transactionId)]
      );
      if (existingLedger.rows.length > 0) {
        log(`⚠️ Idempotency: EZT already awarded for ref ${transactionId}, returning cached ${existingLedger.rows[0].amount}`);
        return parseFloat(existingLedger.rows[0].amount);
      }
    }

    // Get user's current tier from loyalty_tiers (DB-driven, never hardcoded)
    const userResult = await pool.query(
      `SELECT u.id, u.current_tier_name, u.total_tokens_earned, u.available_tokens,
              lt.ezt_reward_percentage, lt.tier_level
       FROM users u
       LEFT JOIN loyalty_tiers lt ON u.current_tier_name = lt.tier_name
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      logError('❌ User not found for token award:', userId);
      return 0;
    }

    const user = userResult.rows[0];
    let tierName = user.current_tier_name || 'Ather';
    // ENTERPRISE: Always read from DB — never fallback to hardcoded values
    let tokenPercentage = parseFloat(user.ezt_reward_percentage) || 1.0;

    // If user has no tier assigned, set default Ather
    if (!user.current_tier_name) {
      await pool.query(
        `UPDATE users SET current_tier_name = 'Ather' WHERE id = $1 AND current_tier_name IS NULL`,
        [userId]
      );
      tierName = 'Ather';
      tokenPercentage = 1.0;
    }

    // Loyalty EZT = (fiat_spent × tier_pct) / 1000. E.g. 1% of ₹2800 = 2.8 EZT; 2% of ₹2800 = 5.6 EZT
    const eztEarned = parseFloat(((amountSpent * tokenPercentage) / 1000).toFixed(5));
    const eztEarnedDecimal = parseFloat(eztEarned);

    if (eztEarnedDecimal > 0) {
      // Update user's token balance (supports 5 decimal places)
      await pool.query(
        `UPDATE users
         SET available_tokens = available_tokens + $1,
             total_tokens_earned = total_tokens_earned + $1
         WHERE id = $2`,
        [eztEarnedDecimal, userId]
      );

      // Record in token ledger (with reference_id for idempotency)
      const balanceBefore = parseFloat(user.available_tokens || 0);
      const balanceAfter = balanceBefore + eztEarnedDecimal;

      await pool.query(
        `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
         VALUES ($1, $2, $3, $4, 'earned', $5, $6, $7)`,
        [userId, transactionId, transactionId ? String(transactionId) : null, eztEarnedDecimal, balanceBefore, balanceAfter, description || `Earned from purchase (${tierName} tier ${tokenPercentage}%)`]
      );

      // Delegate tier progress to tierService (single source of truth)
      try {
        const tierService = require('./tierService');
        await tierService.processBookingWithTier(userId, amountSpent);
      } catch (tierErr) {
        // Don't fail the award if tier progress fails — log and continue
        logError('⚠️ Tier progress update failed (non-blocking):', tierErr.message);
      }

      log(`✅ Awarded ${eztEarned} EZT to user ${userId} (${tierName} tier, ${tokenPercentage}%)`);

      emitRealtimeEvent(REALTIME_EVENTS.TOKENS_UPDATED, {
        action: 'earned',
        userId,
        delta: eztEarnedDecimal,
        description: description || `Earned from purchase (${tierName} tier ${tokenPercentage}%)`,
        availableTokens: balanceAfter,
        totalEarned: (parseFloat(user.total_tokens_earned || 0) + eztEarnedDecimal),
        timestamp: new Date().toISOString()
      });
      emitToRoom(`users:${userId}`, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason: 'tokens_earned' });
    }

    return eztEarnedDecimal;
  } catch (error) {
    logError('❌ Error awarding tokens:', error);
    return 0;
  }
};

// DEPRECATED: Tier progress is now delegated to tierService.processBookingWithTier()
// This wrapper is kept for backward compatibility — callers should migrate to tierService directly
const updateTierProgress = async (userId, amountSpent) => {
  try {
    const tierService = require('./tierService');
    await tierService.processBookingWithTier(userId, amountSpent);
  } catch (error) {
    logError('⚠️ Tier progress update error (non-blocking):', error.message);
  }
};

// Redeem EZT tokens at checkout (₹100 per EZT, supports 5 decimal places)
// STABILIZATION FIX: Accept optional executor (transaction client) to prevent race conditions
// When called from bookingService.createBooking, the transaction client is passed to ensure
// token balance checks and updates are atomic within the booking transaction.
const redeemTokens = async (userId, eztAmount, transactionId = null, description = '', executor = null) => {
  const client = executor || await pool.connect();
  const shouldRelease = !executor;
  try {
    if (!executor) await client.query('BEGIN');

    // STABILIZATION FIX: Use FOR UPDATE to prevent concurrent token overdraw
    // Without this lock, two concurrent bookings could both read the same balance
    // and both succeed, allowing the user to spend more EZT than they own.
    const userResult = await client.query(
      'SELECT available_tokens, total_tokens_spent FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const availableTokens = parseFloat(userResult.rows[0].available_tokens || 0);
    const eztToRedeem = parseFloat(parseFloat(eztAmount).toFixed(5));
    const minAllowedBalance = -EZT_OVERDRAFT_LIMIT;

    if (availableTokens - eztToRedeem < minAllowedBalance) {
      throw new Error(`Insufficient EZT balance. Available: ${availableTokens.toFixed(5)} EZT (balance can go down to ${minAllowedBalance} EZT). Required: ${eztToRedeem.toFixed(5)}`);
    }

    // Calculate discount amount (1 EZT = ₹100), INR to 2 decimals
    const discountAmount = Math.round(eztToRedeem * 100 * 100) / 100;

    // Update user's token balance
    const balanceBefore = availableTokens;
    const balanceAfter = availableTokens - eztToRedeem;

    await client.query(
      `UPDATE users
       SET available_tokens = available_tokens - $1,
           total_tokens_spent = total_tokens_spent + $1
       WHERE id = $2`,
      [eztToRedeem, userId]
    );

    // Record in token ledger
    await client.query(
      `INSERT INTO token_ledger (user_id, transaction_id, amount, ledger_type, balance_before, balance_after, description)
       VALUES ($1, $2, $3, 'spent', $4, $5, $6)`,
      [userId, transactionId, eztToRedeem, balanceBefore, balanceAfter, description || `Redeemed for discount (₹${discountAmount})`]
    );

    if (!executor) await client.query('COMMIT');

    log(`✅ Redeemed ${eztToRedeem.toFixed(5)} EZT from user ${userId} (₹${discountAmount} discount)`);

    emitRealtimeEvent(REALTIME_EVENTS.TOKENS_UPDATED, {
      action: 'redeemed',
      userId,
      delta: -eztToRedeem,
      description: description || `Redeemed for discount (₹${discountAmount})`,
      availableTokens: balanceAfter,
      totalSpent: parseFloat(userResult.rows[0].total_tokens_spent || 0) + eztToRedeem,
      timestamp: new Date().toISOString()
    });
    emitToRoom(`users:${userId}`, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason: 'tokens_redeemed' });

    return {
      eztRedeemed: eztToRedeem,
      discountAmount: discountAmount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter
    };
  } catch (error) {
    if (!executor) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    logError('❌ Error redeeming tokens:', error);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
};

/** Get user EZT balance (available_tokens). For redemption cap and preview. */
const getBalance = async (userId, executor = null) => {
  const db = executor || pool;
  const r = await db.query('SELECT available_tokens FROM users WHERE id = $1', [userId]);
  return r.rows[0] ? parseFloat(r.rows[0].available_tokens || 0) : 0;
};

// Credit a fixed EZT amount (e.g. staff check-in reward) without tier calculation
const creditFixed = async (userId, amount, description = '') => {
  if (!userId || amount == null || amount <= 0) return 0;
  const amt = parseFloat(amount);
  const userResult = await pool.query(
    'SELECT available_tokens FROM users WHERE id = $1',
    [userId]
  );
  if (userResult.rows.length === 0) return 0;
  const balanceBefore = parseFloat(userResult.rows[0].available_tokens || 0);
  const balanceAfter = balanceBefore + amt;
  await pool.query(
    `UPDATE users SET available_tokens = available_tokens + $1, total_tokens_earned = COALESCE(total_tokens_earned, 0) + $1 WHERE id = $2`,
    [amt, userId]
  );
  await pool.query(
    `INSERT INTO token_ledger (user_id, amount, ledger_type, balance_before, balance_after, description)
     VALUES ($1, $2, 'earned', $3, $4, $5)`,
    [userId, amt, balanceBefore, balanceAfter, description || 'Staff check-in reward']
  );
  log(`✅ Credited ${amt} EZT to user ${userId}: ${description || 'Staff check-in reward'}`);
  return amt;
};

/**
 * Credit a precomputed EZT amount (e.g. loyalty from redemption) with idempotency.
 * Use when tier + multiplier have already been applied (e.g. in enhancedRedemptionService).
 * @param {string} userId
 * @param {number} eztAmount - EZT to credit (already computed from fiat paid × tier % × multiplier), 5 decimals
 * @param {string} referenceId - Idempotency key (e.g. booking.id); if already credited for this ref, no-op
 * @param {string} description
 * @param {object} executor - Optional pg client for transaction
 */
const creditEarned = async (userId, eztAmount, referenceId = null, description = '', executor = null) => {
  const db = executor || pool;
  const amt = parseFloat(parseFloat(eztAmount).toFixed(5));
  if (!userId || amt <= 0) return 0;
  if (referenceId) {
    const existing = await db.query(
      `SELECT id, amount FROM token_ledger WHERE user_id = $1 AND reference_id = $2 AND ledger_type = 'earned'`,
      [userId, String(referenceId)]
    );
    if (existing.rows.length > 0) {
      log(`⚠️ Idempotency: EZT already credited for ref ${referenceId}, skipping`);
      return parseFloat(existing.rows[0].amount);
    }
  }
  const userResult = await db.query('SELECT available_tokens FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) return 0;
  const balanceBefore = parseFloat(userResult.rows[0].available_tokens || 0);
  const balanceAfter = balanceBefore + amt;
  await db.query(
    `UPDATE users SET available_tokens = available_tokens + $1, total_tokens_earned = COALESCE(total_tokens_earned, 0) + $1 WHERE id = $2`,
    [amt, userId]
  );
  // transaction_id must reference transactions(id); use NULL for loyalty/redemption credits. reference_id is for idempotency.
  await db.query(
    `INSERT INTO token_ledger (user_id, transaction_id, reference_id, amount, ledger_type, balance_before, balance_after, description)
     VALUES ($1, NULL, $2, $3, 'earned', $4, $5, $6)`,
    [userId, referenceId ? String(referenceId) : null, amt, balanceBefore, balanceAfter, description || 'Loyalty earned']
  );
  log(`✅ Credited ${amt} EZT to user ${userId} (ref ${referenceId || 'none'}): ${description || 'Loyalty earned'}`);
  try {
    emitRealtimeEvent(REALTIME_EVENTS.TOKENS_UPDATED, { action: 'earned', userId, delta: amt });
    emitToRoom(`users:${userId}`, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason: 'tokens_earned' });
  } catch (_) {}
  return amt;
};

module.exports = {
  awardTokens,
  updateTierProgress,
  redeemTokens,
  getBalance,
  getOverdraftLimit,
  creditFixed,
  creditEarned
};

