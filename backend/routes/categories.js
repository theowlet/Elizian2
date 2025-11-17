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

// GET /api/v1/categories - Get all categories
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY display_order ASC, name ASC'
    );

    successResponse(res, 200, 'Categories retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get categories error:', err);
    errorResponse(res, 500, 'Failed to retrieve categories');
  }
});

// GET /api/v1/categories/:id - Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );

    const category = result.rows[0];

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    successResponse(res, 200, 'Category retrieved successfully', category);

  } catch (err) {
    console.error('Get category error:', err);
    errorResponse(res, 500, 'Failed to retrieve category');
  }
});

// POST /api/v1/categories - Create new category
router.post('/', async (req, res) => {
  try {
    const { name, slug, description, display_order, is_active = true } = req.body;

    if (!name || !slug) {
      return errorResponse(res, 400, "Name and slug are required");
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, slug, description, display_order || 1, is_active]
    );

    successResponse(res, 201, 'Category created successfully', result.rows[0]);

  } catch (err) {
    console.error('Create category error:', err);
    if (err.code === '23505') {
      errorResponse(res, 400, 'Category with this name or slug already exists');
    } else {
      errorResponse(res, 500, 'Failed to create category');
    }
  }
});

// PUT /api/v1/categories/:id - Update category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, display_order, is_active } = req.body;

    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           description = COALESCE($3, description),
           display_order = COALESCE($4, display_order),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, slug, description, display_order, is_active, id]
    );

    const category = result.rows[0];

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    successResponse(res, 200, 'Category updated successfully', category);

  } catch (err) {
    console.error('Update category error:', err);
    if (err.code === '23505') {
      errorResponse(res, 400, 'Category with this name or slug already exists');
    } else {
      errorResponse(res, 500, 'Failed to update category');
    }
  }
});

// DELETE /api/v1/categories/:id - Delete category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category has associated partners
    const partnersCheck = await pool.query(
      'SELECT COUNT(*) as count FROM partners WHERE category_id = $1',
      [id]
    );

    if (parseInt(partnersCheck.rows[0].count) > 0) {
      return errorResponse(res, 400, 'Cannot delete category with associated partners');
    }

    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING *',
      [id]
    );

    const category = result.rows[0];

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    successResponse(res, 200, 'Category deleted successfully', category);

  } catch (err) {
    console.error('Delete category error:', err);
    errorResponse(res, 500, 'Failed to delete category');
  }
});

// GET /api/v1/categories/:id/partners - Get partners in a category
router.get('/:id/partners', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM partners p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.category_id = $1 AND p.is_active = true
       ORDER BY p.name ASC`,
      [id]
    );

    successResponse(res, 200, 'Category partners retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get category partners error:', err);
    errorResponse(res, 500, 'Failed to retrieve category partners');
  }
});

module.exports = router;
