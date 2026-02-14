const { getPool } = require('../config/db');

const pool = getPool();

/**
 * Generate unique booking reference
 * Enterprise-standard short format: ELZ-YYMMDD-XXXX
 * - ELZ: Elizian brand prefix (3 chars)
 * - YYMMDD: Date stamp (6 chars)
 * - XXXX: Alphanumeric sequence (4 chars, base-36 from timestamp + random)
 * Total: 16 chars (with dashes), human-readable, sortable by date
 * Example: ELZ-260214-K7M2
 */
function generateBookingReference() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  // 4-char unique suffix: last 2 chars from millisecond-precision timestamp (base36) + 2 random chars
  const timePart = (now.getTime() % 1296).toString(36).toUpperCase().padStart(2, '0'); // 36^2 = 1296
  const randPart = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `ELZ-${yy}${mm}${dd}-${timePart}${randPart}`;
}

/**
 * Create a new booking
 * @param {Object} bookingData - Booking details
 * @param {Object} executor - Database client (for transactions) or pool
 * @returns {Object} Created booking with booking_reference
 */
async function createBooking(bookingData, executor = pool) {
  // Generate unique booking reference if not provided
  const bookingReference = bookingData.booking_reference || generateBookingReference();
  
  // Generate voucher_code if not provided (UUID v4, globally unique, immutable)
  // CRITICAL: Ensure voucher_code is always set - use database default as fallback
  const voucherCode = bookingData.voucher_code || null;
  // Note: If null, database DEFAULT gen_random_uuid() will be used
  // This ensures voucher_code is never missing
  
  // Map the service data to actual table columns
  const result = await executor.query(
    `INSERT INTO bookings (
      booking_reference,
      user_id, 
      event_id, 
      deal_id, 
      partner_id,
      show_id,
      booking_date, 
      booking_time,
      status, 
      total_price, 
      fiat_amount,
      ezt_redeemed,
      num_tickets, 
      num_guests,
      special_requests,
      booking_type,
      reward_eligible,
      voucher_code,
      qr_code_url,
      voucher_state,
      expires_at,
      user_tier_at_booking
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     RETURNING *`,
    [
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
      bookingData.user_tier_at_booking || null
    ]
  );
  return result.rows[0];
}

// Get booking by ID
async function getBookingById(bookingId) {
  const result = await pool.query(
    `SELECT 
      *,
      booking_date::text as booking_date,
      COALESCE(booking_time::text, '') as booking_time
     FROM bookings WHERE id = $1`,
    [bookingId]
  );
  // Ensure booking_time is a string (not null) for consistent frontend handling
  if (result.rows[0]) {
    result.rows[0].booking_time = result.rows[0].booking_time || null;
  }
  return result.rows[0];
}

// Get booking by voucher code (for developer API / validation)
async function getBookingByVoucherCode(voucherCode) {
  const result = await pool.query(
    `SELECT b.id, b.booking_reference, b.user_id, b.partner_id, b.deal_id, b.status, b.voucher_state,
            b.booking_date, b.booking_time, b.expires_at, b.created_at,
            p.name AS partner_name
     FROM bookings b
     LEFT JOIN partners p ON b.partner_id = p.id
     WHERE b.voucher_code = $1`,
    [voucherCode]
  );
  return result.rows[0];
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

// List bookings with filters
async function listBookings({ userId = null, partnerId = null, status = null, limit = 50, offset = 0 } = {}) {
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (userId) {
    paramCount++;
    query += ` AND user_id = $${paramCount}`;
    params.push(userId);
  }

  if (partnerId) {
    paramCount++;
    query += ` AND partner_id = $${paramCount}`;
    params.push(partnerId);
  }

  if (status) {
    paramCount++;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  paramCount++;
  query += ` ORDER BY booking_date DESC LIMIT $${paramCount}`;
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
  generateBookingReference
};

