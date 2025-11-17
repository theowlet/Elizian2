const express = require('express');
const { pool } = require('../../config/database');

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

// GET /api/v1/eznet/venues - Get all venues
router.get('/', async (req, res) => {
  try {
    const { city, capacity_min, capacity_max, category_id } = req.query;
    
    let query = `
      SELECT v.*, c.name as category_name
      FROM venues v
      LEFT JOIN categories c ON v.category_id = c.id
      WHERE v.is_active = true
    `;
    let params = [];

    if (city) {
      query += ` AND LOWER(v.city) = LOWER($${params.length + 1})`;
      params.push(city);
    }

    if (capacity_min) {
      query += ` AND v.max_capacity >= $${params.length + 1}`;
      params.push(capacity_min);
    }

    if (capacity_max) {
      query += ` AND v.max_capacity <= $${params.length + 1}`;
      params.push(capacity_max);
    }

    if (category_id) {
      query += ` AND v.category_id = $${params.length + 1}`;
      params.push(category_id);
    }

    query += ` ORDER BY v.name ASC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Venues retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get venues error:', err);
    errorResponse(res, 500, 'Failed to retrieve venues');
  }
});

// GET /api/v1/eznet/venues/:id - Get venue by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT v.*, c.name as category_name
       FROM venues v
       LEFT JOIN categories c ON v.category_id = c.id
       WHERE v.id = $1 AND v.is_active = true`,
      [id]
    );

    const venue = result.rows[0];

    if (!venue) {
      return errorResponse(res, 404, 'Venue not found');
    }

    // Get upcoming events for this venue
    const eventsResult = await pool.query(
      `SELECT id, title, start_time, end_time, max_capacity, price_per_ticket
       FROM events
       WHERE venue_id = $1 AND status = $2 AND start_time > NOW()
       ORDER BY start_time ASC
       LIMIT 5`,
      [id, 'active']
    );

    venue.upcoming_events = eventsResult.rows;

    // Get average rating from reviews
    const ratingResult = await pool.query(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE venue_id = $1',
      [id]
    );

    venue.avg_rating = ratingResult.rows[0].avg_rating || 0;
    venue.review_count = parseInt(ratingResult.rows[0].review_count) || 0;

    successResponse(res, 200, 'Venue retrieved successfully', venue);

  } catch (err) {
    console.error('Get venue error:', err);
    errorResponse(res, 500, 'Failed to retrieve venue');
  }
});

// POST /api/v1/eznet/venues - Create new venue (protected)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      address,
      city,
      state,
      country,
      phone,
      email,
      website,
      max_capacity,
      category_id,
      latitude,
      longitude,
      amenities,
      is_active = true
    } = req.body;

    if (!name || !address || !city) {
      return errorResponse(res, 400, 'Name, address, and city are required');
    }

    const result = await pool.query(
      `INSERT INTO venues (name, description, address, city, state, country, phone, email, website, max_capacity, category_id, latitude, longitude, amenities, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [name, description, address, city, state, country, phone, email, website, max_capacity, category_id, latitude, longitude, JSON.stringify(amenities || []), is_active]
    );

    successResponse(res, 201, 'Venue created successfully', result.rows[0]);

  } catch (err) {
    console.error('Create venue error:', err);
    errorResponse(res, 500, 'Failed to create venue');
  }
});

// PUT /api/v1/eznet/venues/:id - Update venue
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      address,
      city,
      state,
      country,
      phone,
      email,
      website,
      max_capacity,
      category_id,
      latitude,
      longitude,
      amenities,
      is_active
    } = req.body;

    const result = await pool.query(
      `UPDATE venues 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           state = COALESCE($5, state),
           country = COALESCE($6, country),
           phone = COALESCE($7, phone),
           email = COALESCE($8, email),
           website = COALESCE($9, website),
           max_capacity = COALESCE($10, max_capacity),
           category_id = COALESCE($11, category_id),
           latitude = COALESCE($12, latitude),
           longitude = COALESCE($13, longitude),
           amenities = COALESCE($14, amenities),
           is_active = COALESCE($15, is_active),
           updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [name, description, address, city, state, country, phone, email, website, max_capacity, category_id, latitude, longitude, amenities ? JSON.stringify(amenities) : null, is_active, id]
    );

    const venue = result.rows[0];

    if (!venue) {
      return errorResponse(res, 404, 'Venue not found');
    }

    successResponse(res, 200, 'Venue updated successfully', venue);

  } catch (err) {
    console.error('Update venue error:', err);
    errorResponse(res, 500, 'Failed to update venue');
  }
});

// DELETE /api/v1/eznet/venues/:id - Delete venue
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if venue has events
    const eventsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM events WHERE venue_id = $1',
      [id]
    );

    if (parseInt(eventsCheck.rows[0].count) > 0) {
      return errorResponse(res, 400, 'Cannot delete venue with existing events');
    }

    const result = await pool.query(
      'DELETE FROM venues WHERE id = $1 RETURNING *',
      [id]
    );

    const venue = result.rows[0];

    if (!venue) {
      return errorResponse(res, 404, 'Venue not found');
    }

    successResponse(res, 200, 'Venue deleted successfully', venue);

  } catch (err) {
    console.error('Delete venue error:', err);
    errorResponse(res, 500, 'Failed to delete venue');
  }
});

// GET /api/v1/eznet/venues/:id/events - Get venue events
router.get('/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'active', upcoming_only = 'true' } = req.query;

    let query = `
      SELECT e.*, c.name as category_name
      FROM events e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.venue_id = $1 AND e.status = $2
    `;
    let params = [id, status];

    if (upcoming_only === 'true') {
      query += ` AND e.start_time > NOW()`;
    }

    query += ` ORDER BY e.start_time ASC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Venue events retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get venue events error:', err);
    errorResponse(res, 500, 'Failed to retrieve venue events');
  }
});

// GET /api/v1/eznet/venues/search - Search venues
router.get('/search', async (req, res) => {
  try {
    const { q, city, category, capacity_min } = req.query;

    if (!q && !city && !category && !capacity_min) {
      return errorResponse(res, 400, 'At least one search parameter is required');
    }

    let query = `
      SELECT v.*, c.name as category_name
      FROM venues v
      LEFT JOIN categories c ON v.category_id = c.id
      WHERE v.is_active = true
    `;
    let params = [];

    if (q) {
      query += ` AND (LOWER(v.name) LIKE LOWER($${params.length + 1}) OR LOWER(v.description) LIKE LOWER($${params.length + 1}))`;
      params.push(`%${q}%`);
    }

    if (city) {
      query += ` AND LOWER(v.city) = LOWER($${params.length + 1})`;
      params.push(city);
    }

    if (category) {
      query += ` AND LOWER(c.name) = LOWER($${params.length + 1})`;
      params.push(category);
    }

    if (capacity_min) {
      query += ` AND v.max_capacity >= $${params.length + 1}`;
      params.push(capacity_min);
    }

    query += ` ORDER BY v.name ASC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Venue search completed', result.rows);

  } catch (err) {
    console.error('Search venues error:', err);
    errorResponse(res, 500, 'Failed to search venues');
  }
});

module.exports = router;
