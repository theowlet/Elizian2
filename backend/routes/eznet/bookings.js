const express = require('express');
const { pool } = require('../../config/database');
const { authenticateToken } = require('../auth');

const router = express.Router();

// Helper functions
const successResponse = (res, statusCode, message, data = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
};

const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

// GET /api/v1/eznet/bookings - Get user's bookings (protected)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, event_id } = req.query;
    
    let query = `
      SELECT b.*, e.title as event_title, e.start_time as event_start,
             e.price_per_ticket, v.name as venue_name, v.address as venue_address
      FROM bookings b
      LEFT JOIN events e ON b.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE b.user_id = $1
    `;
    let params = [req.userId];

    if (status) {
      query += ` AND b.status = $${params.length + 1}`;
      params.push(status);
    }

    if (event_id) {
      query += ` AND b.event_id = $${params.length + 1}`;
      params.push(event_id);
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Bookings retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get bookings error:', err);
    errorResponse(res, 500, 'Failed to retrieve bookings');
  }
});

// GET /api/v1/eznet/bookings/:id - Get booking by ID (protected)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, e.title as event_title, e.description as event_description,
              e.start_time as event_start, e.end_time as event_end,
              e.price_per_ticket, v.name as venue_name, v.address as venue_address,
              v.phone as venue_phone, v.email as venue_email
       FROM bookings b
       LEFT JOIN events e ON b.event_id = e.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [id, req.userId]
    );

    const booking = result.rows[0];

    if (!booking) {
      return errorResponse(res, 404, 'Booking not found');
    }

    successResponse(res, 200, 'Booking retrieved successfully', booking);

  } catch (err) {
    console.error('Get booking error:', err);
    errorResponse(res, 500, 'Failed to retrieve booking');
  }
});

// POST /api/v1/eznet/bookings - Create new booking (protected)
router.post('/', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { event_id, num_tickets, special_requests } = req.body;

    if (!event_id || !num_tickets || num_tickets <= 0) {
      return errorResponse(res, 400, 'Event ID and valid number of tickets are required');
    }

    await client.query('BEGIN');

    // Check if event exists and get details
    const eventResult = await client.query(
      'SELECT * FROM events WHERE id = $1 AND status = $2',
      [event_id, 'active']
    );

    const event = eventResult.rows[0];

    if (!event) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Event not found or not active');
    }

    // Check if event has passed
    if (new Date(event.start_time) < new Date()) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, 'Cannot book for past events');
    }

    // Check available seats
    const bookingsResult = await client.query(
      'SELECT COUNT(*) as booked_seats FROM bookings WHERE event_id = $1 AND status = $2',
      [event_id, 'confirmed']
    );

    const bookedSeats = parseInt(bookingsResult.rows[0].booked_seats);
    const availableSeats = event.max_capacity - bookedSeats;

    if (num_tickets > availableSeats) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, `Only ${availableSeats} seats available`);
    }

    // Calculate total price
    const totalPrice = event.price_per_ticket * num_tickets;

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, event_id, num_tickets, total_price, special_requests, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, event_id, num_tickets, totalPrice, special_requests, 'pending']
    );

    const booking = bookingResult.rows[0];

    await client.query('COMMIT');

    successResponse(res, 201, 'Booking created successfully', booking);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create booking error:', err);
    errorResponse(res, 500, 'Failed to create booking');
  } finally {
    client.release();
  }
});

// PUT /api/v1/eznet/bookings/:id/confirm - Confirm booking (protected)
router.put('/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE bookings 
       SET status = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND status = $4
       RETURNING *`,
      ['confirmed', id, req.userId, 'pending']
    );

    const booking = result.rows[0];

    if (!booking) {
      return errorResponse(res, 404, 'Booking not found or already processed');
    }

    successResponse(res, 200, 'Booking confirmed successfully', booking);

  } catch (err) {
    console.error('Confirm booking error:', err);
    errorResponse(res, 500, 'Failed to confirm booking');
  }
});

// PUT /api/v1/eznet/bookings/:id/cancel - Cancel booking (protected)
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE bookings 
       SET status = $1, cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND status IN ($5, $6)
       RETURNING *`,
      ['cancelled', reason, id, req.userId, 'pending', 'confirmed']
    );

    const booking = result.rows[0];

    if (!booking) {
      return errorResponse(res, 404, 'Booking not found or cannot be cancelled');
    }

    successResponse(res, 200, 'Booking cancelled successfully', booking);

  } catch (err) {
    console.error('Cancel booking error:', err);
    errorResponse(res, 500, 'Failed to cancel booking');
  }
});

// GET /api/v1/eznet/bookings/:id/qr - Get booking QR code (protected)
router.get('/:id/qr', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, e.title as event_title, e.start_time as event_start,
              v.name as venue_name
       FROM bookings b
       LEFT JOIN events e ON b.event_id = e.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE b.id = $1 AND b.user_id = $2 AND b.status = $3`,
      [id, req.userId, 'confirmed']
    );

    const booking = result.rows[0];

    if (!booking) {
      return errorResponse(res, 404, 'Confirmed booking not found');
    }

    // Generate QR code data
    const qrData = {
      booking_id: booking.id,
      event_title: booking.event_title,
      venue_name: booking.venue_name,
      event_start: booking.event_start,
      num_tickets: booking.num_tickets,
      user_id: booking.user_id
    };

    successResponse(res, 200, 'QR code data retrieved successfully', {
      qr_data: qrData,
      qr_string: JSON.stringify(qrData)
    });

  } catch (err) {
    console.error('Get QR code error:', err);
    errorResponse(res, 500, 'Failed to retrieve QR code');
  }
});

module.exports = router;
