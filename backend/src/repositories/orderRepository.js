const { getPool } = require('../config/db');

const pool = getPool();

// Ensure orders table exists
async function ensureOrdersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(20),
      customer_email VARCHAR(255),
      items JSONB NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      order_notes TEXT,
      image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add image_url column if it doesn't exist (for existing tables)
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'image_url'
      ) THEN
        ALTER TABLE orders ADD COLUMN image_url VARCHAR(500);
      END IF;
    END $$;
  `);
}

// List orders for a partner
async function listOrders(partnerId, { status = null, limit = 50 } = {}) {
  await ensureOrdersTable();
  
  let query = `SELECT * FROM orders WHERE partner_id = $1`;
  const params = [partnerId];
  
  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

// Get order by ID
async function getOrderById(partnerId, orderId) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND partner_id = $2',
    [orderId, partnerId]
  );
  return result.rows[0];
}

// Update order status
async function updateOrderStatus(partnerId, orderId, status, notes = null, imageUrl = null) {
  const updates = [];
  const values = [];
  let paramCount = 0;

  if (status !== undefined) {
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(status);
  }

  if (notes !== null) {
    paramCount++;
    updates.push(`order_notes = $${paramCount}`);
    values.push(notes);
  }

  if (imageUrl !== undefined) {
    paramCount++;
    updates.push(`image_url = $${paramCount}`);
    values.push(imageUrl);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  paramCount++;
  updates.push('updated_at = CURRENT_TIMESTAMP');
  paramCount++;
  values.push(orderId);
  paramCount++;
  values.push(partnerId);

  const result = await pool.query(
    `UPDATE orders 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount - 1} AND partner_id = $${paramCount}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

module.exports = {
  ensureOrdersTable,
  listOrders,
  getOrderById,
  updateOrderStatus
};

