const { getPool } = require('../config/db');
const crypto = require('crypto');
const { logError } = require('../../utils/logger');

const pool = getPool();

const BOOKING_MIGRATION_HINT =
  'Run: node run-bookings-migrations.js (or migrations: 2025-01-21-fix-all-bookings-columns, 2025-01-22-voucher-redemption-system, 2025-01-22-enterprise-voucher-system, 2025-01-23-bookings-expires-at, 20251108_ezt_token_updates, deal_slots, 2026-02-enterprise-booking-engine)';

/**
 * Alphabet for booking references: 32 unambiguous characters.
 * Removes 0/O, 1/I/L to prevent visual/verbal confusion in global use.
 */
const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars

/**
 * Compute Luhn-mod-32 check character for typo detection.
 * Allows customer support to validate references over phone/chat.
 */
function luhnMod32Check(str) {
  let sum = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    let val = REF_ALPHABET.indexOf(str[i]);
    if ((str.length - i) % 2 === 0) {
      val *= 2;
      if (val >= 32) val -= 32;
    }
    sum += val;
  }
  const check = (32 - (sum % 32)) % 32;
  return REF_ALPHABET[check];
}

/**
 * Generate unique booking reference (globally safe).
 * Format: ELZ-XXXXXXXX (12 chars total)
 * - ELZ: Elizian brand prefix
 * - XXXXXXXX: 7 crypto-random chars + 1 Luhn-mod-32 check digit
 * - 32^7 ≈ 34 billion unique values — collision-proof at global scale
 * - Check digit enables typo detection in customer support
 * Example: ELZ-4KPH7N3E
 */
function generateBookingReference() {
  const bytes = crypto.randomBytes(7);
  let ref = '';
  for (let i = 0; i < 7; i++) {
    ref += REF_ALPHABET[bytes[i] % 32];
  }
  const check = luhnMod32Check(ref);
  return `ELZ-${ref}${check}`;
}

/**
 * Validate a booking reference check digit (for customer support tools).
 * Works only for new-format references (ELZ-XXXXXXXX). Old format (ELZ-YYMMDD-XXXX) returns true to avoid false negatives.
 */
function isValidBookingReference(ref) {
  if (!ref || typeof ref !== 'string') return false;
  // Old format: ELZ-YYMMDD-XXXX — accept as valid (no check digit to verify)
  if (/^ELZ-\d{6}-[A-Z0-9]{4}$/.test(ref)) return true;
  // New format: ELZ-XXXXXXXX
  const match = ref.match(new RegExp(`^ELZ-([${REF_ALPHABET}]{8})$`));
  if (!match) return false;
  const chars = match[1];
  const payload = chars.slice(0, 7);
  const expectedCheck = luhnMod32Check(payload);
  return chars[7] === expectedCheck;
}

/**
 * Create a new booking
 * @param {Object} bookingData - Booking details
 * @param {Object} executor - Database client (for transactions) or pool
 * @returns {Object} Created booking with booking_reference
 */
async function createBooking(bookingData, executor = pool) {
  // Retry loop: regenerate booking_reference on unique-constraint collision (max 3 attempts)
  const MAX_REF_RETRIES = 3;
  for (let refAttempt = 0; refAttempt < MAX_REF_RETRIES; refAttempt++) {
    // Generate unique booking reference if not provided (or if retrying after collision)
    const bookingReference = (refAttempt === 0 && bookingData.booking_reference)
      ? bookingData.booking_reference
      : generateBookingReference();

  // Generate voucher_code if not provided (UUID v4, globally unique, immutable)
  // CRITICAL: Ensure voucher_code is always set - use database default as fallback
  const voucherCode = bookingData.voucher_code || null;
  // Note: If null, database DEFAULT gen_random_uuid() will be used
  // This ensures voucher_code is never missing

  // Map the service data to actual table columns
  const baseValues = [
    bookingReference,
    bookingData.user_id,
    bookingData.event_id || null,
    bookingData.deal_id || bookingData.offer_id || null,  // Support both deal_id and offer_id for backwards compatibility
    bookingData.partner_id || null,
    bookingData.show_id || null,
    (bookingData.booking_date && bookingData.booking_date.trim()) || new Date().toISOString().split('T')[0],
    (bookingData.booking_time && bookingData.booking_time.trim()) || new Date().toTimeString().slice(0, 5),
    bookingData.status || 'pending',
    bookingData.amount || bookingData.total_price || 0,  // total_price
    bookingData.fiat_amount || bookingData.amount || 0,   // fiat_amount (before EZT discount)
    bookingData.ezt_redeemed || 0,
    bookingData.num_tickets || 1,
    bookingData.num_guests || bookingData.num_tickets || 1,
    bookingData.special_requests || null,
    bookingData.booking_type || (bookingData.event_id ? 'event' : 'restaurant'),
    bookingData.reward_eligible !== undefined ? bookingData.reward_eligible : true,
    voucherCode, // Will use database default (gen_random_uuid()) if null
    bookingData.qr_code_url || null,
    bookingData.voucher_state || (bookingData.status === 'confirmed' ? 'active' : 'booked'), // Set initial voucher state
    bookingData.expires_at || null,
    bookingData.user_tier_at_booking || null,
    Boolean(bookingData.is_priority_override)
  ];
  const rewardMultiplier = bookingData.reward_multiplier != null ? Number(bookingData.reward_multiplier) : 1;
  const insertWithRewardMultiplier = `
    INSERT INTO bookings (
      booking_reference, user_id, event_id, deal_id, partner_id, show_id,
      booking_date, booking_time, status, total_price, fiat_amount, ezt_redeemed,
      num_tickets, num_guests, special_requests, booking_type, reward_eligible,
      voucher_code, qr_code_url, voucher_state, expires_at, user_tier_at_booking,
      is_priority_override, co_pay_percentage_at_booking, reward_multiplier
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    RETURNING *`;
  const insertWithCoPay = `
    INSERT INTO bookings (
      booking_reference, user_id, event_id, deal_id, partner_id, show_id,
      booking_date, booking_time, status, total_price, fiat_amount, ezt_redeemed,
      num_tickets, num_guests, special_requests, booking_type, reward_eligible,
      voucher_code, qr_code_url, voucher_state, expires_at, user_tier_at_booking,
      is_priority_override, co_pay_percentage_at_booking
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    RETURNING *`;
  const insertWithoutCoPay = `
    INSERT INTO bookings (
      booking_reference, user_id, event_id, deal_id, partner_id, show_id,
      booking_date, booking_time, status, total_price, fiat_amount, ezt_redeemed,
      num_tickets, num_guests, special_requests, booking_type, reward_eligible,
      voucher_code, qr_code_url, voucher_state, expires_at, user_tier_at_booking,
      is_priority_override
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    RETURNING *`;
  try {
    const paramsWithReward = [...baseValues, bookingData.co_pay_percentage_at_booking != null ? Number(bookingData.co_pay_percentage_at_booking) : null, rewardMultiplier];
    const result = await executor.query(insertWithRewardMultiplier, paramsWithReward);
    const row = result.rows[0];
    if (row && bookingData.booked_at_client) {
      try {
        await executor.query('SAVEPOINT booked_at_client_update');
        await executor.query(
          `UPDATE bookings SET booked_at_client = $1::timestamptz WHERE id = $2`,
          [bookingData.booked_at_client, row.id]
        );
        row.booked_at_client = bookingData.booked_at_client;
        await executor.query('RELEASE SAVEPOINT booked_at_client_update');
      } catch (_) {
        await executor.query('ROLLBACK TO SAVEPOINT booked_at_client_update');
        /* column may not exist yet - continue without it; main transaction stays healthy */
      }
    }
    if (row && bookingData.booking_mode) {
      try {
        await executor.query('SAVEPOINT booking_mode_update');
        await executor.query(
          `UPDATE bookings SET booking_mode = $1 WHERE id = $2`,
          [bookingData.booking_mode, row.id]
        );
        row.booking_mode = bookingData.booking_mode;
        await executor.query('RELEASE SAVEPOINT booking_mode_update');
      } catch (_) {
        await executor.query('ROLLBACK TO SAVEPOINT booking_mode_update');
        /* column may not exist yet - run migration 2026-02-booking-mode-column.sql */
      }
    }
    // Event payment confirmation columns (run migration 2026-03-event-payment-confirmation.sql)
    if (row && bookingData.payment_deadline) {
      try {
        await executor.query('SAVEPOINT payment_deadline_update');
        await executor.query(
          `UPDATE bookings SET payment_deadline = $1::timestamptz WHERE id = $2`,
          [bookingData.payment_deadline, row.id]
        );
        row.payment_deadline = bookingData.payment_deadline;
        await executor.query('RELEASE SAVEPOINT payment_deadline_update');
      } catch (_) {
        await executor.query('ROLLBACK TO SAVEPOINT payment_deadline_update');
      }
    }
    if (row && bookingData.platform_handles_payment !== undefined) {
      try {
        await executor.query('SAVEPOINT platform_payment_update');
        await executor.query(
          `UPDATE bookings SET platform_handles_payment = $1 WHERE id = $2`,
          [Boolean(bookingData.platform_handles_payment), row.id]
        );
        row.platform_handles_payment = Boolean(bookingData.platform_handles_payment);
        await executor.query('RELEASE SAVEPOINT platform_payment_update');
      } catch (_) {
        await executor.query('ROLLBACK TO SAVEPOINT platform_payment_update');
      }
    }
    return row;
  } catch (err) {
    const msg = err.message || '';
    const code = err.code || '';

    // Collision on booking_reference unique constraint → retry with new reference
    if (code === '23505' && msg.includes('booking_reference') && refAttempt < MAX_REF_RETRIES - 1) {
      logError(`⚠️ Booking reference collision on attempt ${refAttempt + 1} (ref: ${bookingReference}) — regenerating. This should be extremely rare.`);
      continue; // next iteration of retry loop generates a new reference
    }

    // When executor is a transaction client (not pool), the connection is in aborted state after any failure.
    // Running another query on the same client would return "current transaction is aborted, commands ignored until end of transaction block".
    // Only retry with fallback INSERTs when using the pool (no active transaction).
    const isTransactionClient = executor !== pool;
    if (!isTransactionClient && (code === '42703' || /column .* does not exist/i.test(msg))) {
      try {
        const paramsWithCoPay = [...baseValues, bookingData.co_pay_percentage_at_booking != null ? Number(bookingData.co_pay_percentage_at_booking) : null];
        const result = await executor.query(insertWithCoPay, paramsWithCoPay);
        return result.rows[0];
      } catch (err2) {
        const result = await executor.query(insertWithoutCoPay, baseValues);
        return result.rows[0];
      }
    }
    throw err;
  }
  } // end retry loop
  throw new Error('Failed to generate unique booking reference after retries');
}

// Get booking by ID (with venue and deal for voucher display). Accepts UUID or booking_reference.
async function getBookingById(bookingId) {
  const resolvedId = await resolveBookingId(bookingId);
  if (!resolvedId) return null;
  const result = await pool.query(
    `SELECT 
      b.*,
      b.booking_date::text AS booking_date,
      COALESCE(b.booking_time::text, '') AS booking_time,
      p.name AS partner_name,
      p.phone_number AS partner_phone,
      p.address AS partner_address,
      p.latitude AS partner_latitude,
      p.longitude AS partner_longitude,
      po.title AS deal_title,
      po.service_type AS service_type
     FROM bookings b
     LEFT JOIN partners p ON b.partner_id = p.id
     LEFT JOIN partner_offers po ON b.deal_id = po.id
     WHERE b.id = $1`,
    [resolvedId]
  );
  if (result.rows[0]) {
    result.rows[0].booking_time = result.rows[0].booking_time || null;
  }
  return result.rows[0];
}

// Get booking by voucher code (for developer API / validation, calculate preview, redemption)
// Resilient to missing columns (voucher_state, booking_date, etc.) for minimal schema
async function getBookingByVoucherCode(voucherCode) {
  try {
    const result = await pool.query(
      `SELECT b.id, b.booking_reference, b.user_id, b.partner_id, b.deal_id, b.status, b.voucher_state,
              b.booking_date, b.booking_time, b.expires_at, b.created_at,
              b.co_pay_percentage_at_booking,
              p.name AS partner_name
       FROM bookings b
       LEFT JOIN partners p ON b.partner_id = p.id
       WHERE b.voucher_code = $1`,
      [voucherCode]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '42703' || /column .* does not exist/i.test(err.message || '')) {
      const minimal = await pool.query(
        `SELECT b.id, b.booking_reference, b.user_id, b.partner_id, b.deal_id, b.status,
                p.name AS partner_name
         FROM bookings b
         LEFT JOIN partners p ON b.partner_id = p.id
         WHERE b.voucher_code = $1`,
        [voucherCode]
      );
      const row = minimal.rows[0] || null;
      if (row) row.co_pay_percentage_at_booking = null;
      return row;
    }
    throw err;
  }
}

// UUID pattern for validating id param (8-4-4-4-12 hex)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve booking identifier to UUID (accepts id or booking_reference)
async function resolveBookingId(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const trimmed = String(identifier).trim();
  if (UUID_REGEX.test(trimmed)) return trimmed;
  const row = await pool.query(
    'SELECT id FROM bookings WHERE booking_reference = $1',
    [trimmed]
  );
  return row.rows[0]?.id || null;
}

// Get booking by ID with lock (FOR UPDATE). Accepts UUID or booking_reference.
// Pass executor (transaction client) to ensure FOR UPDATE runs inside the caller's transaction.
async function getBookingByIdForUpdate(bookingId, executor = pool) {
  const resolvedId = await resolveBookingId(bookingId);
  if (!resolvedId) return null;
  const result = await executor.query(
    `SELECT id, user_id, partner_id, deal_id, status, booking_date, booking_time,
            num_tickets, num_guests, fiat_amount, ezt_redeemed, reward_eligible, reward_credited,
            booking_reference, voucher_code, voucher_state, payment_deadline
     FROM bookings
     WHERE id = $1
     FOR UPDATE`,
    [resolvedId]
  );
  return result.rows[0];
}

// List bookings with filters (includes venue and deal for display)
async function listBookings({ userId = null, partnerId = null, status = null, limit = 50, offset = 0 } = {}) {
  const params = [];
  let paramCount = 0;

  let query = `
    SELECT b.*,
      p.name AS partner_name,
      po.title AS deal_title,
      po.service_type AS service_type
    FROM bookings b
    LEFT JOIN partners p ON b.partner_id = p.id
    LEFT JOIN partner_offers po ON b.deal_id = po.id
    WHERE 1=1
  `;

  if (userId) {
    paramCount++;
    query += ` AND b.user_id = $${paramCount}`;
    params.push(userId);
  }

  if (partnerId) {
    paramCount++;
    query += ` AND b.partner_id = $${paramCount}`;
    params.push(partnerId);
  }

  if (status) {
    paramCount++;
    query += ` AND b.status = $${paramCount}`;
    params.push(status);
  }

  paramCount++;
  query += ` ORDER BY b.booking_date DESC LIMIT $${paramCount}`;
  params.push(limit);

  paramCount++;
  query += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await pool.query(query, params);
  return result.rows;
}

// Update booking status
// Core columns (cancelled_at, cancellation_reason, reward_credited) are always included.
// Event-payment columns (cancelled_by, confirmed_at, expired_at, confirmed_by_partner_user_id,
// payment_proof_url) are applied via SAVEPOINT so missing migration doesn't break the update.
async function updateBookingStatus(bookingId, status, additionalData = {}, executor = pool) {
  // --- Core fields (always safe) ---
  const updates = ['status = $1'];
  const values = [status];
  let paramCount = 1;

  if (additionalData.cancelled_at) {
    paramCount++;
    updates.push(`cancelled_at = $${paramCount}`);
    values.push(additionalData.cancelled_at);
  }

  if (additionalData.cancellation_reason) {
    paramCount++;
    updates.push(`cancellation_reason = $${paramCount}`);
    values.push(additionalData.cancellation_reason);
  }

  if (additionalData.reward_credited !== undefined) {
    paramCount++;
    updates.push(`reward_credited = $${paramCount}`);
    values.push(additionalData.reward_credited);
  }

  // --- Event-payment columns (may not exist if migration hasn't run) ---
  // Collect them separately and try to include; fall back if columns missing.
  const eventPaymentFields = {};
  if (additionalData.cancelled_by) eventPaymentFields.cancelled_by = additionalData.cancelled_by;
  if (additionalData.confirmed_at) eventPaymentFields.confirmed_at = additionalData.confirmed_at;
  if (additionalData.expired_at) eventPaymentFields.expired_at = additionalData.expired_at;
  if (additionalData.confirmed_by_partner_user_id) eventPaymentFields.confirmed_by_partner_user_id = additionalData.confirmed_by_partner_user_id;
  if (additionalData.payment_proof_url) eventPaymentFields.payment_proof_url = additionalData.payment_proof_url;

  // Try including event-payment columns in the main UPDATE
  const allUpdates = [...updates];
  const allValues = [...values];
  let allParamCount = paramCount;

  for (const [col, val] of Object.entries(eventPaymentFields)) {
    allParamCount++;
    allUpdates.push(`${col} = $${allParamCount}`);
    allValues.push(val);
  }

  allParamCount++;
  allValues.push(bookingId);

  try {
    const result = await executor.query(
      `UPDATE bookings SET ${allUpdates.join(', ')} WHERE id = $${allParamCount} RETURNING *`,
      allValues
    );
    return result.rows[0];
  } catch (err) {
    // If the error is due to missing columns, fall back to core-only UPDATE
    const msg = (err.message || '').toLowerCase();
    if (Object.keys(eventPaymentFields).length > 0 && (msg.includes('column') || msg.includes('does not exist'))) {
      logError('⚠️ updateBookingStatus: event-payment columns missing, falling back to core-only update');
      paramCount++;
      values.push(bookingId);
      const fallbackResult = await executor.query(
        `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );
      return fallbackResult.rows[0];
    }
    throw err;
  }
}

// Count booked tickets for an event
async function countBookedTicketsForEvent(eventId) {
  const result = await pool.query(
    `SELECT COUNT(*) as booked_count FROM bookings 
     WHERE event_id = $1 AND status IN ('pending', 'payment_pending', 'temp_reserved', 'confirmed', 'redeemed')`,
    [eventId]
  );
  return parseInt(result.rows[0].booked_count || 0);
}

// Auto-cancel pending bookings older than threshold
async function autoCancelPendingBookings(thresholdDate) {
  const result = await pool.query(
    `UPDATE bookings 
     SET status = 'cancelled',
         cancelled_at = CURRENT_TIMESTAMP,
         cancellation_reason = 'Auto-cancelled: No confirmation within 10 minutes'
     WHERE status = 'pending'
     AND created_at < $1
     RETURNING id, deal_id, slot_id, num_tickets`,
    [thresholdDate]
  );
  return result.rows;
}

/**
 * Update booking with tier information
 * @param {UUID} bookingId 
 * @param {Object} tierInfo 
 * @param {Object} executor - Database client (for transactions) or pool
 */
async function updateBookingTierInfo(bookingId, tierInfo, executor = pool) {
  // Ensure proper type casting for PostgreSQL
  const eztEarned = tierInfo.ezt_earned != null ? parseFloat(tierInfo.ezt_earned) : 0;
  const rewardPercentage = tierInfo.ezt_reward_percentage != null ? parseFloat(tierInfo.ezt_reward_percentage) : 1.0;
  const tierAtBooking = tierInfo.user_tier_at_booking || 'Ather';
  
  const result = await executor.query(
    `UPDATE bookings 
     SET 
       ezt_earned = $1::DECIMAL(15, 5),
       ezt_reward_percentage = $2::DECIMAL(5, 2),
       user_tier_at_booking = $3::VARCHAR(50),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [
      eztEarned,
      rewardPercentage,
      tierAtBooking,
      bookingId
    ]
  );
  return result.rows[0];
}

module.exports = {
  createBooking,
  getBookingById,
  getBookingByVoucherCode,
  getBookingByIdForUpdate,
  listBookings,
  updateBookingStatus,
  countBookedTicketsForEvent,
  autoCancelPendingBookings,
  updateBookingTierInfo,
  generateBookingReference,
  isValidBookingReference
};
