const express = require('express');
const { pool } = require('../../config/database');
const { authenticateToken } = require('../auth');
const path = require('path');
const fs = require('fs');

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

// GET /api/v1/eznet/events - Get all events
router.get('/', async (req, res) => {
  try {
    const { venue_id, date, status = 'active' } = req.query;
    
    let query = `
      SELECT e.*, v.name as venue_name, v.address as venue_address,
             v.latitude as venue_lat, v.longitude as venue_lng,
             c.name as category_name
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.status = $1
    `;
    let params = [status];

    if (venue_id) {
      query += ` AND e.venue_id = $${params.length + 1}`;
      params.push(venue_id);
    }

    if (date) {
      query += ` AND DATE(e.start_time) = $${params.length + 1}`;
      params.push(date);
    }

    query += ` ORDER BY e.start_time ASC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Events retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get events error:', err);
    errorResponse(res, 500, 'Failed to retrieve events');
  }
});

// GET /api/v1/eznet/events/:id - Get event by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*, v.name as venue_name, v.address as venue_address,
              v.latitude as venue_lat, v.longitude as venue_lng,
              c.name as category_name
       FROM events e
       LEFT JOIN venues v ON e.venue_id = v.id
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.id = $1`,
      [id]
    );

    const event = result.rows[0];

    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }

    // Get available seats
    const seatsResult = await pool.query(
      'SELECT COUNT(*) as available_seats FROM bookings WHERE event_id = $1 AND status = $2',
      [id, 'confirmed']
    );

    const totalSeats = event.max_capacity || 0;
    const bookedSeats = parseInt(seatsResult.rows[0].available_seats);
    const availableSeats = totalSeats - bookedSeats;

    event.available_seats = availableSeats;
    event.total_seats = totalSeats;
    event.booked_seats = bookedSeats;

    successResponse(res, 200, 'Event retrieved successfully', event);

  } catch (err) {
    console.error('Get event error:', err);
    errorResponse(res, 500, 'Failed to retrieve event');
  }
});

// POST /api/v1/eznet/events - Create new event (protected)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      venue_id,
      category_id,
      start_time,
      end_time,
      max_capacity,
      price_per_ticket,
      status = 'active'
    } = req.body;

    if (!title || !venue_id || !start_time) {
      return errorResponse(res, 400, 'Title, venue_id, and start_time are required');
    }

    const result = await pool.query(
      `INSERT INTO events (title, description, venue_id, category_id, start_time, end_time, max_capacity, price_per_ticket, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title, description, venue_id, category_id, start_time, end_time, max_capacity, price_per_ticket, status, req.userId]
    );

    successResponse(res, 201, 'Event created successfully', result.rows[0]);

  } catch (err) {
    console.error('Create event error:', err);
    errorResponse(res, 500, 'Failed to create event');
  }
});

// PUT /api/v1/eznet/events/:id - Update event (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      venue_id,
      category_id,
      start_time,
      end_time,
      max_capacity,
      price_per_ticket,
      status,
      image_url,
      image_base64,
      image_filename,
      organizer_name
    } = req.body;

    // Handle image upload (base64 or URL)
    let finalImageUrl = image_url || null;
    try {
      if (!finalImageUrl && image_base64) {
        const uploadsDir = path.join(__dirname, '../../../frontend/public/uploads/events');
        fs.mkdirSync(uploadsDir, { recursive: true });
        
        let base64Data = image_base64;
        let extension = 'jpg';
        const match = /^data:(.*?);base64,(.*)$/.exec(image_base64);
        
        if (match) {
          const mime = match[1] || 'image/jpeg';
          base64Data = match[2];
          if (mime.includes('png')) extension = 'png';
          else if (mime.includes('webp')) extension = 'webp';
          else if (mime.includes('jpeg') || mime.includes('jpg')) extension = 'jpg';
        }
        
        const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) || `event_${Date.now()}.${extension}`;
        const targetPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        finalImageUrl = `/uploads/events/${safeName}`;
        console.log(`✅ Event image uploaded: ${finalImageUrl}`);
      }
    } catch (fileErr) {
      console.error('❌ Event image upload error:', fileErr);
      // Continue with update even if image upload fails
    }

    const result = await pool.query(
      `UPDATE events 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           venue_id = COALESCE($3, venue_id),
           category_id = COALESCE($4, category_id),
           start_time = COALESCE($5, start_time),
           end_time = COALESCE($6, end_time),
           max_capacity = COALESCE($7, max_capacity),
           price_per_ticket = COALESCE($8, price_per_ticket),
           status = COALESCE($9, status),
           image_url = COALESCE($10, image_url),
           organizer_name = COALESCE($11, organizer_name),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [title, description, venue_id, category_id, start_time, end_time, max_capacity, price_per_ticket, status, finalImageUrl, organizer_name, id]
    );

    const event = result.rows[0];

    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }

    successResponse(res, 200, 'Event updated successfully', event);

  } catch (err) {
    console.error('Update event error:', err);
    errorResponse(res, 500, 'Failed to update event');
  }
});

// DELETE /api/v1/eznet/events/:id - Soft delete event (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if event has bookings
    const bookingsCheck = await client.query(
      'SELECT COUNT(*) as count FROM bookings WHERE event_id = $1',
      [id]
    );

    if (parseInt(bookingsCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, 'Cannot delete event with existing bookings');
    }

    // Soft delete the event
    const result = await client.query(
      `UPDATE events 
       SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    const event = result.rows[0];

    if (!event) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Event not found');
    }

    // Soft delete linked menu_item (if it exists)
    const menuItemResult = await client.query(
      `UPDATE menu_items 
       SET is_available = false, updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = $1 AND name = $2 AND service_type = 'events'
       RETURNING id`,
      [event.venue_id, event.title]
    );

    if (menuItemResult.rows.length > 0) {
      console.log(`🗑️ Soft-deleted linked menu item for event: ${event.title} (id: ${menuItemResult.rows[0].id})`);
    } else {
      console.log(`⚠️ No linked menu item found for deleted event: ${event.title}`);
    }

    await client.query('COMMIT');
    successResponse(res, 200, 'Event deleted successfully', event);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete event error:', err);
    errorResponse(res, 500, 'Failed to delete event');
  } finally {
    client.release();
  }
});

// GET /api/v1/eznet/events/:id/bookings - Get event bookings (protected)
router.get('/:id/bookings', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, u.first_name, u.last_name, u.email, u.phone_number
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.event_id = $1
       ORDER BY b.created_at DESC`,
      [id]
    );

    successResponse(res, 200, 'Event bookings retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get event bookings error:', err);
    errorResponse(res, 500, 'Failed to retrieve event bookings');
  }
});

module.exports = router;
