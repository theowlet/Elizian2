// ============================================
// SUBCATEGORIES API ROUTES (ISO/ISIC ALIGNED)
// Provides standardized service subcategories
// ============================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Initialize database connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

/**
 * GET /api/v1/subcategories
 * Query params: service_type (required)
 * Returns: ISO-compliant subcategories for the given service type
 */
router.get('/', async (req, res) => {
  try {
    const { service_type } = req.query;
    
    if (!service_type) {
      return res.status(400).json({
        success: false,
        message: 'service_type parameter is required'
      });
    }
    
    // Normalize service type (handle both spa and spa-and-salon)
    let normalizedType = service_type.toLowerCase().trim();
    
    // Map 'spa' to 'spa-and-salon' for backwards compatibility
    if (normalizedType === 'spa') {
      normalizedType = 'spa-and-salon';
    }
    
    const result = await pool.query(
      `SELECT id, service_type, name, description, iso_reference, is_active
       FROM service_subcategories 
       WHERE is_active = true AND service_type = $1 
       ORDER BY name ASC`,
      [normalizedType]
    );
    
    res.json({
      success: true,
      message: `Found ${result.rows.length} subcategories for ${normalizedType}`,
      service_type: normalizedType,
      subcategories: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('❌ Error fetching subcategories:', err);
    res.status(500).json({
      success: false,
      message: 'Error loading subcategories',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * GET /api/v1/subcategories/all
 * Returns: All active subcategories grouped by service type
 */
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT service_type, json_agg(
        json_build_object(
          'id', id,
          'name', name,
          'description', description,
          'iso_reference', iso_reference
        ) ORDER BY name ASC
      ) as subcategories
       FROM service_subcategories 
       WHERE is_active = true 
       GROUP BY service_type
       ORDER BY service_type ASC`
    );
    
    // Transform into a more convenient object format
    const grouped = {};
    result.rows.forEach(row => {
      grouped[row.service_type] = row.subcategories;
    });
    
    res.json({
      success: true,
      message: 'Retrieved all subcategories',
      data: grouped,
      types: Object.keys(grouped)
    });
  } catch (err) {
    console.error('❌ Error fetching all subcategories:', err);
    res.status(500).json({
      success: false,
      message: 'Error loading subcategories',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * GET /api/v1/subcategories/stats
 * Returns: Statistics about subcategories
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         service_type,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         COUNT(*) FILTER (WHERE is_active = false) as inactive
       FROM service_subcategories 
       GROUP BY service_type
       ORDER BY service_type ASC`
    );
    
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM service_subcategories WHERE is_active = true`
    );
    
    res.json({
      success: true,
      message: 'Subcategories statistics',
      total_active: parseInt(totalResult.rows[0].total),
      by_type: result.rows,
      standards: [
        'ISO 18513:2003 (Hotels and other tourism accommodation)',
        'ISIC Rev.4 (International Standard Industrial Classification)',
        'WHO Global Wellness Economy',
        'UNWTO (UN World Tourism Organization)',
        'NAICS (North American Industry Classification)'
      ]
    });
  } catch (err) {
    console.error('❌ Error fetching subcategory stats:', err);
    res.status(500).json({
      success: false,
      message: 'Error loading statistics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;

