const { getPool } = require('../config/db');
const { enrichWithLifecycleStatus, separateByLifecycle } = require('../utils/lifecycle');

const pool = getPool();

// Ensure menu_items table exists
async function ensureMenuItemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100),
      is_available BOOLEAN DEFAULT true,
      image_url VARCHAR(500),
      preparation_time INT DEFAULT 15,
      service_category_id UUID REFERENCES service_categories(id),
      duration_minutes INTEGER,
      max_capacity INTEGER,
      requires_booking BOOLEAN DEFAULT false,
      service_type VARCHAR(50) DEFAULT 'food',
      event_date DATE,
      event_time TIME,
      organizer_name VARCHAR(255),
      venue_name VARCHAR(255),
      is_time_bound BOOLEAN DEFAULT false,
      start_time TIMESTAMP NULL,
      end_time TIMESTAMP NULL,
      status VARCHAR(20) DEFAULT 'active',
      is_trending BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add is_trending column if it doesn't exist
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'is_trending'
      ) THEN
        ALTER TABLE menu_items ADD COLUMN is_trending BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_menu_items_trending ON menu_items(is_trending);
      END IF;
    END $$;
  `);
}

// List menu items for a partner
async function listMenuItems(partnerId, { include_lifecycle = false } = {}) {
  await ensureMenuItemsTable();
  
  const result = await pool.query(`
    SELECT mi.*, sc.name as service_category_name, sc.slug as service_category_slug, sc.icon as service_category_icon
    FROM menu_items mi
    LEFT JOIN service_categories sc ON mi.service_category_id = sc.id
    WHERE mi.partner_id = $1 
    ORDER BY mi.created_at DESC
  `, [partnerId]);

  const enrichedItems = enrichWithLifecycleStatus(result.rows);

  if (include_lifecycle) {
    const separated = separateByLifecycle(result.rows);
    return {
      active: separated.active,
      archived: separated.archived,
      scheduled: separated.scheduled,
      total: enrichedItems.length
    };
  }

  return enrichedItems;
}

// Get menu item by ID
async function getMenuItemById(partnerId, itemId) {
  const result = await pool.query(
    'SELECT * FROM menu_items WHERE id = $1 AND partner_id = $2',
    [itemId, partnerId]
  );
  return result.rows[0];
}

// Create menu item
async function createMenuItem(partnerId, menuItemData) {
  await ensureMenuItemsTable();
  
  const {
    name, description, price, category, is_available = true, image_url,
    preparation_time = 15, service_category_id, duration_minutes, max_capacity,
    requires_booking = false, service_type = 'food', event_date, event_time,
    organizer_name, venue_name, is_trending = false
  } = menuItemData;

  console.log('[menuRepository] Creating menu item with image_url:', image_url);
  
  const result = await pool.query(
    `INSERT INTO menu_items (partner_id, name, description, price, category, is_available, image_url, preparation_time, service_category_id, duration_minutes, max_capacity, requires_booking, service_type, event_date, event_time, organizer_name, venue_name, is_trending)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [partnerId, name, description, price, category, is_available, image_url, preparation_time, service_category_id, duration_minutes, max_capacity, requires_booking, service_type, event_date, event_time, organizer_name, venue_name, is_trending]
  );
  
  console.log('[menuRepository] Menu item created, returned image_url:', result.rows[0]?.image_url);
  return result.rows[0];
}

// Update menu item
async function updateMenuItem(partnerId, itemId, updates) {
  const allowedFields = [
    'name', 'description', 'price', 'category', 'is_available', 'image_url',
    'preparation_time', 'is_trending', 'service_type', 'duration_minutes',
    'max_capacity', 'requires_booking', 'event_date', 'event_time',
    'organizer_name', 'venue_name'
  ];
  
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      paramCount++;
      updateFields.push(`${key} = $${paramCount}`);
      values.push(value);
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  // Add updated_at (doesn't need a parameter)
  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  
  // Add WHERE clause parameters
  paramCount++;
  values.push(partnerId);
  paramCount++;
  values.push(itemId);

  const result = await pool.query(
    `UPDATE menu_items 
     SET ${updateFields.join(', ')}
     WHERE partner_id = $${paramCount - 1} AND id = $${paramCount}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

// Delete menu item
async function deleteMenuItem(partnerId, itemId) {
  const result = await pool.query(
    'DELETE FROM menu_items WHERE id = $1 AND partner_id = $2 RETURNING *',
    [itemId, partnerId]
  );
  return result.rows[0];
}

module.exports = {
  ensureMenuItemsTable,
  listMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};

