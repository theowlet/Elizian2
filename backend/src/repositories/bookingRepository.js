const { getPool } = require('../config/db');

const pool = getPool();

/**
 * Generate unique booking reference
 * Format: BK-{timestamp}-{random}
 */
function generateBookingReference() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BK-${timestamp}-${random}`;
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
      reward_eligible
    )
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIME, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      bookingReference,
      bookingData.user_id,
      bookingData.event_id || null,
      bookingData.deal_id || bookingData.offer_id || null,  // Support both deal_id and offer_id for backwards compatibility
      bookingData.partner_id || null,
      bookingData.show_id || null,
      bookingData.status || 'pending',
      bookingData.amount || bookingData.total_price || 0,  // total_price
      bookingData.fiat_amount || bookingData.amount || 0,   // fiat_amount (before EZT discount)
      bookingData.ezt_redeemed || 0,
      bookingData.num_tickets || 1,
      bookingData.num_guests || bookingData.num_tickets || 1,
      bookingData.special_requests || null,
      bookingData.booking_type || (bookingData.event_id ? 'event' : 'restaurant'),
      bookingData.reward_eligible !== undefined ? bookingData.reward_eligible : true
    ]
  );
  return result.rows[0];
}

// Get booking by ID
async function getBookingById(bookingId) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE id = $1`,
    [bookingId]
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
async function updateBookingStatus(bookingId, status, additionalData = {}) {
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

  const result = await pool.query(
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
  const result = await executor.query(
    `UPDATE bookings 
     SET 
       ezt_earned = $1,
       ezt_reward_percentage = $2,
       user_tier_at_booking = $3,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [
      tierInfo.ezt_earned || 0,
      tierInfo.ezt_reward_percentage || 1.0,
      tierInfo.user_tier_at_booking || 'Aether',
      bookingId
    ]
  );
  return result.rows[0];
}

module.exports = {
  createBooking,
  getBookingById,
  getBookingByIdForUpdate,
  listBookings,
  updateBookingStatus,
  countBookedTicketsForEvent,
  autoCancelPendingBookings,
  updateBookingTierInfo,
  generateBookingReference
};

