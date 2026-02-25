const { getPool } = require('../config/db');
const crypto = require('crypto');

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
    bookingData.booking_date || new Date().toISOString().split('T')[0], // Use provided booking_date or current date
    // CRITICAL: Only use fallback if booking_time is null/undefined, not if it's empty string
    // Empty string is valid (means no specific time), null/undefined means use current time
    (bookingData.booking_time !== null && bookingData.booking_time !== undefined)
      ? bookingData.booking_time
      : new Date().toTimeString().slice(0, 5), // Use provided booking_time or current time
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
    return result.rows[0];
  } catch (err) {
    const msg = err.message || '';
    const code = err.code || '';

    // Collision on booking_reference unique constraint → retry with new reference
    if (code === '23505' && msg.includes('booking_reference') && refAttempt < MAX_REF_RETRIES - 1) {
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

// Get booking by ID (with venue and deal for voucher display)
async function getBookingById(bookingId) {
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
      po.title AS deal_title
     FROM bookings b
     LEFT JOIN partners p ON b.partner_id = p.id
     LEFT JOIN partner_offers po ON b.deal_id = po.id
     WHERE b.id = $1`,
    [bookingId]
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

// Get booking by ID with lock (FOR UPDATE)
async function getBookingByIdForUpdate(bookingId) {
  const result = await pool.query(
    `SELECT id, user_id, partner_id, fiat_amount, ezt_redeemed, reward_eligible, reward_credited, booking_reference
     FROM bookings
     WHERE id = $1
     FOR UPDATE`,
    [bookingId]
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
      po.title AS deal_title
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
async function updateBookingStatus(bookingId, status, additionalData = {}, executor = pool) {
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

  paramCount++;
  values.push(bookingId);

  const result = await executor.query(
    `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

// Count booked tickets for an event
async function countBookedTicketsForEvent(eventId) {
  const result = await pool.query(
    `SELECT COUNT(*) as booked_count FROM bookings 
     WHERE event_id = $1 AND status IN ('pending', 'confirmed', 'redeemed')`,
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
