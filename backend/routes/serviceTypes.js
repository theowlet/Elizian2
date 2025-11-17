// ============================================
// SERVICE TYPES API (VIRTUAL/COMPUTED)
// Dynamically derives service types from subcategories
// Maintains VARCHAR-based system (no master table needed)
// ============================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Initialize database connection pool - Railway compatible
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

/**
 * Icon mapping for service types
 * Can be extended without code changes by adding to DB in future
 */
const SERVICE_TYPE_ICONS = {
  dining: '🍽️',
  events: '🎉',
  'spa-and-salon': '💆‍♀️',
  wellness: '🧘',
  travel: '✈️',
  healthcare: '🩺',
  others: '📦'
};

/**
 * Label mapping for service types
 * Converts kebab-case keys to user-friendly labels
 */
const SERVICE_TYPE_LABELS = {
  dining: 'Dining & Restaurants',
  events: 'Events & Entertainment',
  'spa-and-salon': 'Spa & Salon',
  wellness: 'Wellness & Lifestyle',
  travel: 'Travel & Tourism',
  healthcare: 'Healthcare & Medical',
  others: 'Other Services'
};

/**
 * Description mapping for service types
 */
const SERVICE_TYPE_DESCRIPTIONS = {
  dining: 'Food and beverage services',
  events: 'Social and corporate gatherings',
  'spa-and-salon': 'Personal care and grooming',
  wellness: 'Holistic and preventive health',
  travel: 'Tours and travel packages',
  healthcare: 'Doctors, clinics, labs, pharmacies',
  others: 'General and emerging services'
};

/**
 * GET /api/v1/service-types
 * Returns: All active service types (computed from subcategories table)
 * 
 * This is a "virtual" endpoint - no master service_types table needed.
 * Service types are dynamically derived from existing subcategories.
 */
router.get('/', async (req, res) => {
  try {
    // Query distinct service types from subcategories
    const result = await pool.query(`
      SELECT DISTINCT service_type
      FROM service_subcategories
      WHERE is_active = true
      ORDER BY service_type ASC
    `);

    // Transform into rich service type objects
    const service_types = result.rows.map(row => {
      const key = row.service_type;
      return {
        key: key,
        label: SERVICE_TYPE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
        icon: SERVICE_TYPE_ICONS[key] || '🔹',
        description: SERVICE_TYPE_DESCRIPTIONS[key] || '',
        has_subcategories: key !== 'dining' // Dining uses menu categories
      };
    });

    res.json({
      success: true,
      message: `Found ${service_types.length} service types`,
      service_types: service_types,
      count: service_types.length
    });
  } catch (err) {
    console.error('❌ Error fetching service types:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching service types',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * GET /api/v1/service-types/validate/:key
 * Returns: Whether a service type key is valid
 */
router.get('/validate/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM service_subcategories WHERE service_type = $1 AND is_active = true`,
      [key]
    );
    
    const isValid = parseInt(result.rows[0].count) > 0;
    
    res.json({
      success: true,
      key: key,
      is_valid: isValid,
      message: isValid ? `Service type '${key}' is valid` : `Service type '${key}' not found`
    });
  } catch (err) {
    console.error('❌ Error validating service type:', err);
    res.status(500).json({
      success: false,
      message: 'Error validating service type',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * GET /api/v1/service-types/stats
 * Returns: Statistics about service types and subcategories
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        service_type,
        COUNT(*) as subcategory_count,
        array_agg(name ORDER BY name) as subcategories
      FROM service_subcategories
      WHERE is_active = true
      GROUP BY service_type
      ORDER BY service_type ASC
    `);
    
    const stats = result.rows.map(row => ({
      service_type: row.service_type,
      label: SERVICE_TYPE_LABELS[row.service_type] || row.service_type,
      icon: SERVICE_TYPE_ICONS[row.service_type] || '🔹',
      subcategory_count: parseInt(row.subcategory_count),
      subcategories: row.subcategories
    }));
    
    const totalSubcategories = stats.reduce((sum, s) => sum + s.subcategory_count, 0);
    
    res.json({
      success: true,
      message: 'Service type statistics',
      total_types: stats.length,
      total_subcategories: totalSubcategories,
      by_type: stats
    });
  } catch (err) {
    console.error('❌ Error fetching service type stats:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;

