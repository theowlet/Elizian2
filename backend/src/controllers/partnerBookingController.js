const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { normalizeTierName } = require('../utils/tierNames');
const bookingRepository = require('../repositories/bookingRepository');

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
    let statusFilter = '';
    if (status) {
      statusFilter = ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    } else {
      // Default "All Status" = active bookings only (exclude cancelled)
      statusFilter = ` AND b.status != 'cancelled'`;
    }

    const baseFrom = `
      FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE ${whereClause}${statusFilter}
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
      ${baseFrom} ${orderLimit}
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
      ${baseFrom} ${orderLimit}
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
      ${baseFrom} ${orderLimit}
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

    const countSql = `
      SELECT COUNT(*) FROM bookings b
      LEFT JOIN partner_offers po ON b.deal_id = po.id
      WHERE ${whereClause}${statusFilter}
    `;
    const countParams = [...params];
    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    const redeemedIds = result.rows.filter((b) => b.status === 'redeemed').map((b) => b.id);
    let redemptionByBooking = {};
    if (redeemedIds.length > 0) {
      const raResult = await pool.query(
        `SELECT DISTINCT ON (booking_id) booking_id, total_bill_amount, ezt_co_pay_amount, net_amount_from_user
         FROM redemption_audit
         WHERE booking_id = ANY($1::uuid[]) AND redemption_status IN ('redeemed', 'disputed')
         ORDER BY booking_id, redeemed_at DESC`,
        [redeemedIds]
      );
      raResult.rows.forEach((r) => {
        redemptionByBooking[r.booking_id] = {
          total_bill_amount: r.total_bill_amount != null ? parseFloat(r.total_bill_amount) : null,
          ezt_co_pay_amount: r.ezt_co_pay_amount != null ? parseFloat(r.ezt_co_pay_amount) : null,
          net_amount_from_user: r.net_amount_from_user != null ? parseFloat(r.net_amount_from_user) : null
        };
      });
    }

    const bookings = result.rows.map((b) => {
      const base = { ...b, customer_tier: normalizeTierName(b.customer_tier || 'Ather') };
      if (b.status === 'redeemed' && redemptionByBooking[b.id]) {
        const r = redemptionByBooking[b.id];
        base.total_price = r.total_bill_amount;
        base.fiat_amount = r.net_amount_from_user;
      }
      return base;
    });

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
        u.current_tier_name as customer_tier
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

    if (booking.status === 'redeemed') {
      // Include 'disputed' so we still return amounts for display when customer disputed (audit row has amounts from redemption time)
      const ra = await pool.query(
        `SELECT total_bill_amount, ezt_co_pay_amount, net_amount_from_user, redeemed_at
         FROM redemption_audit
         WHERE booking_id = $1 AND redemption_status IN ('redeemed', 'disputed')
         ORDER BY redeemed_at DESC LIMIT 1`,
        [bookingId]
      );
      if (ra.rows.length > 0) {
        const r = ra.rows[0];
        booking.redemption_total_bill = r.total_bill_amount != null ? parseFloat(r.total_bill_amount) : null;
        booking.redemption_ezt_co_pay = r.ezt_co_pay_amount != null ? parseFloat(r.ezt_co_pay_amount) : null;
        booking.redemption_net_from_user = r.net_amount_from_user != null ? parseFloat(r.net_amount_from_user) : null;
        booking.redeemed_at = r.redeemed_at;
      }
    }

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

/**
 * Server-side voucher lookup for partner scanner (avoids client-side search over only loaded bookings).
 * GET /api/v1/partners/:id/vouchers/lookup?code=XXX
 */
async function lookupVoucher(req, res) {
  try {
    const { id: partnerId } = req.params;
    const code = (req.query.code || req.query.voucher_code || '').toString().trim();
    if (!code) {
      return errorResponse(res, 400, 'Query parameter "code" or "voucher_code" is required');
    }
    const booking = await bookingRepository.getBookingByVoucherCode(code);
    if (!booking) {
      return errorResponse(res, 404, 'Voucher not found');
    }
    if (String(booking.partner_id) !== String(partnerId)) {
      return errorResponse(res, 403, 'Voucher is not for your venue');
    }
    return successResponse(res, 200, 'Voucher found', {
      valid: true,
      booking_reference: booking.booking_reference,
      deal_id: booking.deal_id,
      status: booking.status,
      voucher_code: booking.voucher_code || code,
      id: booking.id,
      user_id: booking.user_id
    });
  } catch (err) {
    logError('❌ Voucher lookup error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Voucher lookup failed');
  }
}

module.exports = {
  listPartnerBookings,
  getPartnerBooking,
  updateBookingStatus,
  getBookingStats,
  lookupVoucher
};

