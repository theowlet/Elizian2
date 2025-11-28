const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

const pool = getPool();

/**
 * List bookings for a partner
 * GET /api/v1/partners/:id/bookings
 */
async function listPartnerBookings(req, res) {
  try {
    const { id: partnerId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        b.id,
        b.deal_id,
        b.user_id,
        b.booking_date,
        b.booking_time as time_slot,
        b.num_tickets,
        b.total_price,
        b.fiat_amount,
        b.ezt_redeemed,
        b.ezt_earned,
        b.points_earned,
        b.user_tier_at_booking,
        b.status,
        b.special_requests,
        b.created_at,
        b.updated_at,
        po.title as deal_title,
        po.service_type,
        u.first_name || ' ' || u.last_name as customer_name,
        u.email as customer_email,
        u.phone_number as customer_phone,
        u.current_tier_name as customer_tier
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE po.partner_id = $1
    `;

    const params = [partnerId];
    let paramIndex = 2;

    if (status) {
      query += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get count
    let countQuery = `
      SELECT COUNT(*) 
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      WHERE po.partner_id = $1
    `;
    const countParams = [partnerId];
    
    if (status) {
      countQuery += ` AND b.status = $2`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return successResponse(res, 200, 'Bookings retrieved successfully', {
      bookings: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    logError('❌ Partner bookings retrieval error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve bookings');
  }
}

/**
 * Get booking details
 * GET /api/v1/partners/:id/bookings/:bookingId
 */
async function getPartnerBooking(req, res) {
  try {
    const { id: partnerId, bookingId } = req.params;

    const query = `
      SELECT 
        b.id,
        b.deal_id,
        b.user_id,
        b.booking_date,
        b.booking_time as time_slot,
        b.num_tickets,
        b.num_guests,
        b.total_price,
        b.fiat_amount,
        b.ezt_redeemed,
        b.status,
        b.special_requests,
        b.booking_type,
        b.booking_reference,
        b.confirmed_at,
        b.cancelled_at,
        b.cancellation_reason,
        b.created_at,
        b.updated_at,
        po.title as deal_title,
        po.service_type,
        po.partner_id,
        u.first_name || ' ' || u.last_name as customer_name,
        u.email as customer_email,
        u.phone_number as customer_phone,
        u.tier as customer_tier
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.id = $1 AND po.partner_id = $2
    `;

    const result = await pool.query(query, [bookingId, partnerId]);

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Booking not found');
    }

    return successResponse(res, 200, 'Booking retrieved successfully', result.rows[0]);
  } catch (err) {
    logError('❌ Partner booking retrieval error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve booking');
  }
}

/**
 * Update booking status
 * PUT /api/v1/partners/:id/bookings/:bookingId/status
 */
async function updateBookingStatus(req, res) {
  const client = await pool.connect();
  
  try {
    const { id: partnerId, bookingId } = req.params;
    const { status, notes } = req.body;

    // Valid statuses
    const validStatuses = ['confirmed', 'cancelled', 'completed', 'no_show'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    await client.query('BEGIN');

    // Verify booking belongs to this partner
    const checkQuery = `
      SELECT b.id, b.status as current_status
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      WHERE b.id = $1 AND po.partner_id = $2
    `;
    const checkResult = await client.query(checkQuery, [bookingId, partnerId]);

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Booking not found');
    }

    // Update booking
    const updateQuery = `
      UPDATE bookings
      SET status = $1, 
          updated_at = CURRENT_TIMESTAMP,
          special_requests = CASE 
            WHEN $2 IS NOT NULL THEN COALESCE(special_requests, '') || E'\n\nPartner Notes: ' || $2
            ELSE special_requests
          END
      WHERE id = $3
      RETURNING *
    `;
    const updateResult = await client.query(updateQuery, [status, notes || null, bookingId]);

    await client.query('COMMIT');

    return successResponse(res, 200, 'Booking status updated successfully', updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('❌ Booking status update error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to update booking');
  } finally {
    client.release();
  }
}

/**
 * Get booking statistics for partner dashboard
 * GET /api/v1/partners/:id/bookings/stats
 */
async function getBookingStats(req, res) {
  try {
    const { id: partnerId } = req.params;
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [partnerId];
    
    if (startDate && endDate) {
      dateFilter = ` AND b.created_at BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    const query = `
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE b.status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE b.status = 'pending') as pending,
        COUNT(*) FILTER (WHERE b.status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE b.status = 'completed') as completed,
        COALESCE(SUM(b.total_price), 0) as total_revenue,
        COALESCE(SUM(b.fiat_amount), 0) as fiat_revenue,
        COALESCE(SUM(b.ezt_redeemed), 0) as total_ezt_redeemed,
        COALESCE(SUM(b.num_tickets), 0) as total_tickets
      FROM bookings b
      INNER JOIN partner_offers po ON b.deal_id = po.id
      WHERE po.partner_id = $1${dateFilter}
    `;

    const result = await pool.query(query, params);

    return successResponse(res, 200, 'Booking statistics retrieved successfully', result.rows[0]);
  } catch (err) {
    logError('❌ Booking stats retrieval error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve booking stats');
  }
}

module.exports = {
  listPartnerBookings,
  getPartnerBooking,
  updateBookingStatus,
  getBookingStats
};

