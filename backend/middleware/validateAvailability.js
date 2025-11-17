// ============================================
// AVAILABILITY VALIDATION MIDDLEWARE
// Prevents bookings for expired services
// ============================================

const { Pool } = require('pg');
const { computeLifecycleStatus, getLifecycleMessage } = require('../utils/lifecycle');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

/**
 * Validate that a service is available for booking
 * Checks lifecycle status and prevents expired bookings
 */
exports.validateAvailability = async (req, res, next) => {
  const { item_id, service_id, event_id, menu_item_id } = req.body;
  const { id } = req.params;
  
  // Determine which ID to use
  const serviceId = item_id || service_id || event_id || menu_item_id || id;
  
  if (!serviceId) {
    return res.status(400).json({ 
      success: false, 
      message: "Service ID is required" 
    });
  }

  try {
    // Fetch service from menu_items
    const result = await pool.query(
      `SELECT * FROM menu_items WHERE id = $1`,
      [serviceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Service not found" 
      });
    }

    const item = result.rows[0];
    
    // Compute lifecycle status
    const lifecycleStatus = computeLifecycleStatus(item);
    
    // Check if service is expired
    if (lifecycleStatus === 'expired') {
      return res.status(400).json({ 
        success: false, 
        message: "This service has expired and is no longer available for booking.",
        lifecycle_status: 'expired',
        end_time: item.end_time
      });
    }
    
    // Check if service is archived or cancelled
    if (item.status === 'archived' || item.status === 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: `This service is ${item.status} and cannot be booked.`,
        lifecycle_status: item.status
      });
    }
    
    // Check if service hasn't started yet (scheduled)
    if (lifecycleStatus === 'scheduled') {
      return res.status(400).json({ 
        success: false, 
        message: getLifecycleMessage(item),
        lifecycle_status: 'scheduled',
        start_time: item.start_time
      });
    }
    
    // Service is available - attach to request for use in route
    req.serviceItem = item;
    req.lifecycleStatus = lifecycleStatus;
    
    next();
  } catch (err) {
    console.error('Availability validation error:', err);
    res.status(500).json({ 
      success: false, 
      message: "Availability check failed" 
    });
  }
};

/**
 * Soft validation - doesn't block request but adds warning
 * Useful for read-only operations
 */
exports.checkAvailability = async (req, res, next) => {
  const { id } = req.params;
  
  if (!id) {
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT * FROM menu_items WHERE id = $1`,
      [id]
    );

    if (result.rows.length > 0) {
      const item = result.rows[0];
      const lifecycleStatus = computeLifecycleStatus(item);
      
      req.serviceItem = item;
      req.lifecycleStatus = lifecycleStatus;
      req.isExpired = lifecycleStatus === 'expired';
    }
    
    next();
  } catch (err) {
    console.error('Availability check error:', err);
    next(); // Don't block on check errors
  }
};

module.exports = exports;

