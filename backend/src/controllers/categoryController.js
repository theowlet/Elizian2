const { getPool } = require('../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

const pool = getPool();

async function fetchPrimaryCategories() {
  const result = await pool.query(`
    SELECT 
      id, 
      name, 
      slug, 
      description, 
      icon_url AS icon, 
      NULL::text AS color, 
      display_order, 
      is_active
    FROM categories
    WHERE is_active = true
    ORDER BY display_order ASC, name ASC
  `);
  return result.rows;
}

async function fetchServiceCategories() {
  const result = await pool.query(`
    SELECT 
      id,
      name,
      slug,
      description,
      icon,
      NULL::text AS color,
      display_order,
      true AS is_active
    FROM service_categories
    ORDER BY display_order ASC, name ASC
  `);
  return result.rows;
}

function getFallbackCategories() {
  return [
    { id: '1', name: 'Food & Dining', slug: 'food-dining', description: 'Restaurants and food services' },
    { id: '2', name: 'Entertainment', slug: 'entertainment', description: 'Events and entertainment' },
    { id: '3', name: 'Shopping', slug: 'shopping', description: 'Retail and shopping' },
    { id: '4', name: 'Wellness', slug: 'wellness', description: 'Health and wellness services' },
    { id: '5', name: 'Travel', slug: 'travel', description: 'Travel and hospitality' }
  ];
}

// Get all categories
async function listCategories(req, res) {
  try {
    let categories = [];

    try {
      categories = await fetchPrimaryCategories();
    } catch (primaryErr) {
      if (primaryErr.code !== '42P01') {
        throw primaryErr;
      }

      try {
        categories = await fetchServiceCategories();
      } catch (serviceErr) {
        if (serviceErr.code !== '42P01') {
          throw serviceErr;
        }
        categories = getFallbackCategories();
      }
    }

    successResponse(res, 200, 'Categories retrieved successfully', categories);
  } catch (err) {
    logError('❌ Categories fetch error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve categories');
  }
}

module.exports = {
  listCategories
};

