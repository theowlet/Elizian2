const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { normalizeTierName } = require('../utils/tierNames');

const pool = getPool();

/**
 * List bookings for a partner.
 * Uses a minimal SELECT so it works across schemas (missing_tables + migrations).
 * GET /api/v1/partners/:id/bookings
 */
async function listPartnerBookings(req, res) {
  try {
    const { id: partnerId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    const whereClause = `(po.partner_id = $1 OR (b.partner_id = $1 AND (b.deal_id IS NULL OR po.id IS NULL)))`;
    const params = [partnerId];
    let paramIndex = 2;
    if (status) {
      paramIndex++;
    }

    const baseFrom = `
      FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE ${whereClause}
    `;
    const orderLimit = ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const listParams = [...params, parseInt(limit, 10), parseInt(offset, 10)];

    const selectWithAmount = `
      SELECT
        b.id, b.deal_id, b.event_id, b.user_id, b.partner_id, b.booking_date, b.status,
        COALESCE(b.num_tickets, 1) as num_tickets,
        COALESCE(b.amount, 0) as total_price,
        COALESCE(b.amount, 0) as fiat_amount,
        b.special_requests, b.created_at, b.updated_at,
        b.booking_reference, b.voucher_code, b.qr_code_url,
        COALESCE(po.title, 'Event') as deal_title,
        COALESCE(po.service_type, 'event') as service_type,
        u.first_name || ' ' || COALESCE(u.last_name, '') as customer_name,
        u.email as customer_email, u.phone_number as customer_phone,
        NULL::time as time_slot, 0::decimal as ezt_redeemed, 0::decimal as ezt_earned, 0::decimal as points_earned,
        NULL::varchar as user_tier_at_booking,
        'Ather' as customer_tier
      ${baseFrom} ${status ? ' AND b.status = $2' : ''} ${orderLimit}
    `;
    const selectWithTotalPrice = `
      SELECT
        b.id, b.deal_id, b.event_id, b.user_id, b.partner_id, b.booking_date, b.status,
        COALESCE(b.num_tickets, 1) as num_tickets,
        COALESCE(b.total_price, 0) as total_price,
        COALESCE(b.total_price, 0) as fiat_amount,
        b.special_requests, b.created_at, b.updated_at,
        b.booking_reference, b.voucher_code, b.qr_code_url,
        COALESCE(po.title, 'Event') as deal_title,
        COALESCE(po.service_type, 'event') as service_type,
        u.first_name || ' ' || COALESCE(u.last_name, '') as customer_name,
        u.email as customer_email, u.phone_number as customer_phone,
        NULL::time as time_slot, 0::decimal as ezt_redeemed, 0::decimal as ezt_earned, 0::decimal as points_earned,
        NULL::varchar as user_tier_at_booking,
        'Ather' as customer_tier
      ${baseFrom} ${status ? ' AND b.status = $2' : ''} ${orderLimit}
    `;
    const selectMinimal = `
      SELECT
        b.id, b.deal_id, b.event_id, b.user_id, b.partner_id, b.booking_date, b.status,
        1 as num_tickets, 0::decimal as total_price, 0::decimal as fiat_amount,
        b.special_requests, b.created_at, b.updated_at,
        COALESCE(po.title, 'Event') as deal_title,
        COALESCE(po.service_type, 'event') as service_type,
        u.first_name || ' ' || COALESCE(u.last_name, '') as customer_name,
        u.email as customer_email, u.phone_number as customer_phone,
        NULL::time as time_slot, 0::decimal as ezt_redeemed, 0::decimal as ezt_earned, 0::decimal as points_earned,
        NULL::varchar as user_tier_at_booking,
        NULL::varchar as booking_reference, NULL::varchar as voucher_code, NULL::varchar as qr_code_url,
        'Ather' as customer_tier
      ${baseFrom} ${status ? ' AND b.status = $2' : ''} ${orderLimit}
    `;

    let result;
    try {
      result = await pool.query(selectWithAmount, listParams);
    } catch (e1) {
      if (e1.code === '42703' || /column .* does not exist/i.test(e1.message || '')) {
        try {
          result = await pool.query(selectWithTotalPrice, listParams);
        } catch (e2) {
          if (e2.code === '42703' || /column .* does not exist/i.test(e2.message || '')) {
            result = await pool.query(selectMinimal, listParams);
          } else {
            logError('Partner bookings list (total_price query failed):', e2.message);
            throw e2;
          }
        }
      } else {
        throw e1;
      }
    }

    let countSql = `
      SELECT COUNT(*) FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      WHERE ${whereClause}
    `;
    const countParams = [partnerId];
    if (status) {
      countSql += ` AND b.status = $2`;
      countParams.push(status);
    }
    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    const bookings = result.rows.map((b) => ({
      ...b,
      customer_tier: normalizeTierName(b.customer_tier || 'Ather')
    }));

    return successResponse(res, 200, 'Bookings retrieved successfully', {
      bookings,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  } catch (err) {
    const msg = err.message || 'Failed to retrieve bookings';
    const code = err.code || err.statusCode;
    logError('❌ Partner bookings retrieval error:', { message: msg, code, stack: err.stack });
    return errorResponse(res, err.statusCode || 500, msg);
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
        b.event_id,
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
        b.voucher_code,
        b.qr_code_url,
        b.user_tier_at_booking,
        b.confirmed_at,
        b.cancelled_at,
        b.cancellation_reason,
        b.created_at,
        b.updated_at,
        COALESCE(po.title, 'Event') as deal_title,
        COALESCE(po.service_type, 'event') as service_type,
        COALESCE(po.partner_id, b.partner_id) as partner_id,
        u.first_name || ' ' || u.last_name as customer_name,
        u.email as customer_email,
        u.phone_number as customer_phone,
        u.tier as customer_tier
      FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.id = $1 AND (po.partner_id = $2 OR (b.partner_id = $2 AND (b.deal_id IS NULL OR po.id IS NULL)))
    `;

    const result = await pool.query(query, [bookingId, partnerId]);

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Booking not found');
    }

    const booking = result.rows[0];
    booking.customer_tier = normalizeTierName(booking.customer_tier || booking.user_tier_at_booking);
    return successResponse(res, 200, 'Booking retrieved successfully', booking);
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
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      WHERE b.id = $1 AND (po.partner_id = $2 OR (b.partner_id = $2 AND (b.deal_id IS NULL OR po.id IS NULL)))
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
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      WHERE (po.partner_id = $1 OR (b.partner_id = $1 AND (b.deal_id IS NULL OR po.id IS NULL)))${dateFilter}
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

