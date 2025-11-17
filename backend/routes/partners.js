const express = require('express');
const { pool } = require('../config/database');

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

// GET /api/v1/partners - Get all partners with optional category filter
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM partners p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true
    `;
    let params = [];

    if (category) {
      query += ` AND c.slug = $1`;
      params.push(category);
    }

    query += ` ORDER BY p.name ASC`;

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Partners retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get partners error:', err);
    errorResponse(res, 500, 'Failed to retrieve partners');
  }
});

// GET /api/v1/partners/:id - Get partner by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM partners p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.is_active = true`,
      [id]
    );

    const partner = result.rows[0];

    if (!partner) {
      return errorResponse(res, 404, 'Partner not found');
    }

    successResponse(res, 200, 'Partner retrieved successfully', partner);

  } catch (err) {
    console.error('Get partner error:', err);
    errorResponse(res, 500, 'Failed to retrieve partner');
  }
});

// POST /api/v1/partners - Create new partner
router.post('/', async (req, res) => {
  try {
    const {
      name,
      category_id,
      description,
      address,
      phone,
      email,
      discount_percentage,
      rating,
      coordinates,
      is_active = true
    } = req.body;

    if (!name || !category_id) {
      return errorResponse(res, 400, "Name and category_id are required");
    }

    const lat = coordinates?.lat || null;
    const lng = coordinates?.lng || null;

    const result = await pool.query(
      `INSERT INTO partners (name, category_id, description, address, phone, email, discount_percentage, rating, latitude, longitude, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, category_id, description, address, phone, email, discount_percentage || 0, rating, lat, lng, is_active]
    );

    successResponse(res, 201, 'Partner created successfully', result.rows[0]);

  } catch (err) {
    console.error('Create partner error:', err);
    if (err.code === '23503') {
      errorResponse(res, 400, 'Invalid category_id');
    } else {
      errorResponse(res, 500, 'Failed to create partner');
    }
  }
});

// PUT /api/v1/partners/:id - Update partner
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category_id,
      description,
      address,
      phone,
      email,
      discount_percentage,
      rating,
      coordinates,
      is_active
    } = req.body;

    const lat = coordinates?.lat || null;
    const lng = coordinates?.lng || null;

    const result = await pool.query(
      `UPDATE partners 
       SET name = COALESCE($1, name),
           category_id = COALESCE($2, category_id),
           description = COALESCE($3, description),
           address = COALESCE($4, address),
           phone = COALESCE($5, phone),
           email = COALESCE($6, email),
           discount_percentage = COALESCE($7, discount_percentage),
           rating = COALESCE($8, rating),
           latitude = COALESCE($9, latitude),
           longitude = COALESCE($10, longitude),
           is_active = COALESCE($11, is_active),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [name, category_id, description, address, phone, email, discount_percentage, rating, lat, lng, is_active, id]
    );

    const partner = result.rows[0];

    if (!partner) {
      return errorResponse(res, 404, 'Partner not found');
    }

    successResponse(res, 200, 'Partner updated successfully', partner);

  } catch (err) {
    console.error('Update partner error:', err);
    errorResponse(res, 500, 'Failed to update partner');
  }
});

// DELETE /api/v1/partners/:id - Delete partner
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM partners WHERE id = $1 RETURNING *',
      [id]
    );

    const partner = result.rows[0];

    if (!partner) {
      return errorResponse(res, 404, 'Partner not found');
    }

    successResponse(res, 200, 'Partner deleted successfully', partner);

  } catch (err) {
    console.error('Delete partner error:', err);
    errorResponse(res, 500, 'Failed to delete partner');
  }
});

module.exports = router;
