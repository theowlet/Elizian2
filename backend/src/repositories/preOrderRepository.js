const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Check if user is Echelon tier
async function isEchelonTier(userId) {
  try {
    const result = await pool.query(
      `SELECT current_tier_name FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.current_tier_name === 'Echelon';
  } catch (error) {
    logError('Error checking user tier:', error);
    return false;
  }
}

// Create pre-order (Echelon tier only)
async function createPreOrder(preOrderData, client = pool) {
  try {
    const {
      booking_id,
      reservation_id,
      partner_id,
      user_id,
      items,
      total_amount,
      special_instructions,
      dietary_requirements
    } = preOrderData;

    // Verify user is Echelon tier
    const isEchelon = await isEchelonTier(user_id);
    if (!isEchelon) {
      throw new Error('Pre-ordering is only available for Echelon tier members');
    }

    const result = await client.query(
      `INSERT INTO pre_orders 
       (booking_id, reservation_id, partner_id, user_id, items, total_amount, 
        special_instructions, dietary_requirements, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        booking_id,
        reservation_id,
        partner_id,
        user_id,
        JSON.stringify(items),
        total_amount,
        special_instructions,
        dietary_requirements
      ]
    );

    log(`Pre-order created for Echelon user ${user_id}: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (error) {
    logError('Error creating pre-order:', error);
    throw error;
  }
}

// Get pre-order by ID
async function getPreOrderById(preOrderId) {
  try {
    const result = await pool.query(
      `SELECT * FROM pre_orders WHERE id = $1`,
      [preOrderId]
    );
    if (result.rows[0]) {
      result.rows[0].items = typeof result.rows[0].items === 'string' 
        ? JSON.parse(result.rows[0].items) 
        : result.rows[0].items;
    }
    return result.rows[0];
  } catch (error) {
    logError('Error getting pre-order:', error);
    throw error;
  }
}

// Get pre-order by booking ID
async function getPreOrderByBookingId(bookingId) {
  try {
    const result = await pool.query(
      `SELECT * FROM pre_orders WHERE booking_id = $1`,
      [bookingId]
    );
    if (result.rows.length > 0) {
      result.rows[0].items = typeof result.rows[0].items === 'string' 
        ? JSON.parse(result.rows[0].items) 
        : result.rows[0].items;
      return result.rows[0];
    }
    return null;
  } catch (error) {
    logError('Error getting pre-order by booking:', error);
    throw error;
  }
}

// Update pre-order status (for restaurant)
async function updatePreOrderStatus(preOrderId, status, estimatedReadyTime = null) {
  try {
    const result = await pool.query(
      `UPDATE pre_orders 
       SET status = $1,
           estimated_ready_time = $2,
           updated_at = CURRENT_TIMESTAMP,
           confirmed_at = CASE WHEN $1 = 'confirmed' THEN CURRENT_TIMESTAMP ELSE confirmed_at END
       WHERE id = $3
       RETURNING *`,
      [status, estimatedReadyTime, preOrderId]
    );
    
    if (result.rows[0]) {
      result.rows[0].items = typeof result.rows[0].items === 'string' 
        ? JSON.parse(result.rows[0].items) 
        : result.rows[0].items;
    }
    
    return result.rows[0];
  } catch (error) {
    logError('Error updating pre-order status:', error);
    throw error;
  }
}

// Get pre-orders for a partner (restaurant view)
async function getPartnerPreOrders(partnerId, status = null, limit = 50) {
  try {
    let query = `SELECT po.*, 
         u.first_name, u.last_name, u.phone_number,
         tr.reservation_date, tr.reservation_time, tr.party_size
       FROM pre_orders po
       JOIN users u ON po.user_id = u.id
       LEFT JOIN table_reservations tr ON po.reservation_id = tr.id
       WHERE po.partner_id = $1`;
    
    const params = [partnerId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND po.status = $${paramCount}`;
      params.push(status);
    }

    paramCount++;
    query += ` ORDER BY po.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));
  } catch (error) {
    logError('Error getting partner pre-orders:', error);
    throw error;
  }
}

module.exports = {
  isEchelonTier,
  createPreOrder,
  getPreOrderById,
  getPreOrderByBookingId,
  updatePreOrderStatus,
  getPartnerPreOrders
};

