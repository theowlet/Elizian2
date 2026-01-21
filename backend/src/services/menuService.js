const menuRepository = require('../repositories/menuRepository');
const partnerRepository = require('../repositories/partnerRepository');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { handleImageUpload, deleteOldImage } = require('../utils/imageUpload');
const { getPool } = require('../config/db');

const pool = getPool();

// Helper: Sync menu item to events table
async function syncMenuItemToEvent(client, menuItem) {
  try {
    if (menuItem.service_type !== 'events') {
      return { success: true, message: 'Not an event, skipping sync' };
    }

    if (!menuItem.event_date || !menuItem.event_time) {
      log('⚠️ Event missing date/time, skipping sync:', menuItem.name);
      return { success: false, message: 'Missing event_date or event_time' };
    }

    let dateStr = menuItem.event_date;
    if (dateStr instanceof Date) {
      dateStr = dateStr.toISOString().split('T')[0];
    } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }

    let timeStr = menuItem.event_time;
    if (typeof timeStr === 'string') {
      timeStr = timeStr.split('+')[0].split('Z')[0];
      if (timeStr.split(':').length === 2) {
        timeStr += ':00';
      }
    }

    const startTime = `${dateStr} ${timeStr}`;
    const endTime = null;
    const bookingCap = menuItem.max_capacity || null;
    const pricePerTicket = menuItem.price || 0;
    const imageUrl = menuItem.image_url || null;
    const description = menuItem.description || null;
    const status = menuItem.is_available ? 'active' : 'inactive';

    const existing = await client.query(
      'SELECT id FROM events WHERE venue_id = $1 AND title = $2 LIMIT 1',
      [menuItem.partner_id, menuItem.name]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE events
         SET description = $1, start_time = $2, end_time = $3, booking_cap = $4,
             price_per_ticket = $5, image_url = $6, status = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [description, startTime, endTime, bookingCap, pricePerTicket, imageUrl, status, existing.rows[0].id]
      );
      log(`✅ Synced menu item to existing event: ${menuItem.name}`);
      return { success: true, message: 'Event updated', eventId: existing.rows[0].id };
    } else {
      const result = await client.query(
        `INSERT INTO events (venue_id, title, description, start_time, end_time, booking_cap, price_per_ticket, image_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [menuItem.partner_id, menuItem.name, description, startTime, endTime, bookingCap, pricePerTicket, imageUrl, status]
      );
      log(`✅ Created new event from menu item: ${menuItem.name}`);
      return { success: true, message: 'Event created', eventId: result.rows[0].id };
    }
  } catch (err) {
    logError('❌ Error syncing menu item to event:', err);
    return { success: false, message: err.message };
  }
}

// Helper: Handle image upload (delegates to shared utility)
function handleMenuItemImageUpload(image_base64, image_filename, service_type) {
  const subFolder = service_type === 'events' ? 'events' : 'menu';
  const prefix = service_type === 'events' ? 'event' : 'item';
  return handleImageUpload(image_base64, image_filename, subFolder, prefix);
}

// List menu items
async function listMenuItems(partnerId, filters = {}) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return await menuRepository.listMenuItems(partnerId, filters);
}

// Create menu item
async function createMenuItem(partnerId, menuItemData) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner || !partner.is_active) {
    throw new AppError(404, "Partner not found or inactive");
  }

  const { name, price } = menuItemData;
  if (!name || price === undefined || price === null) {
    throw new AppError(400, "Name and price are required");
  }

  if (isNaN(price) || price < 0) {
    throw new AppError(400, "Price must be 0 or greater");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Handle image upload
    let finalImageUrl = menuItemData.image_url || null;
    log(`📸 Menu item image check: has image_url=${!!menuItemData.image_url}, has image_base64=${!!menuItemData.image_base64}`);
    
    if (!finalImageUrl && menuItemData.image_base64) {
      log('📤 Processing menu item image upload...');
      try {
        finalImageUrl = await handleMenuItemImageUpload(
          menuItemData.image_base64,
          menuItemData.image_filename,
          menuItemData.service_type || 'food'
        );
        log(`✅ Menu item image uploaded successfully: ${finalImageUrl}`);
      } catch (imageErr) {
        logError('❌ Menu item image upload failed:', imageErr);
        throw imageErr; // Re-throw to fail the transaction
      }
    }
    
    log(`💾 Final image_url for menu item: ${finalImageUrl || 'NULL'}`);

    const menuItem = await menuRepository.createMenuItem(partnerId, {
      ...menuItemData,
      image_url: finalImageUrl
    });
    
    log(`✅ Menu item created with image_url: ${menuItem.image_url || 'NULL'}`);

    // Sync to events table if it's an event-type menu item
    const syncResult = await syncMenuItemToEvent(client, menuItem);
    if (syncResult.success) {
      log(syncResult.message);
    } else {
      logError('⚠️ Event sync warning:', syncResult.message);
    }

    await client.query('COMMIT');
    return menuItem;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Update menu item
async function updateMenuItem(partnerId, itemId, updates) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner || !partner.is_active) {
    throw new AppError(404, "Partner not found or inactive");
  }

  const existingItem = await menuRepository.getMenuItemById(partnerId, itemId);
  if (!existingItem) {
    throw new AppError(404, "Menu item not found");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Handle image update
    // Priority: 1) new image_base64, 2) explicit image_url, 3) existing image_url
    let finalImageUrl = existingItem.image_url; // Preserve existing by default
    
    if (updates.image_base64) {
      // Delete old image if it exists
      if (existingItem.image_url) {
        deleteOldImage(existingItem.image_url);
      }
      
      // New image uploaded - process it
      finalImageUrl = await handleMenuItemImageUpload(
        updates.image_base64,
        updates.image_filename,
        existingItem.service_type || 'food'
      );
    } else if (updates.image_url !== undefined) {
      // Explicit image_url provided (could be null to remove image)
      finalImageUrl = updates.image_url;
    }

    // Filter out fields that shouldn't be passed to repository
    const { image_base64, image_filename, service_category_id, ...cleanUpdates } = updates;
    
    const updatedItem = await menuRepository.updateMenuItem(partnerId, itemId, {
      ...cleanUpdates,
      image_url: finalImageUrl
    });

    // Sync to events table if it's an event-type menu item
    const syncResult = await syncMenuItemToEvent(client, updatedItem);
    if (syncResult.success) {
      log(syncResult.message);
    } else {
      logError('⚠️ Event sync warning:', syncResult.message);
    }

    await client.query('COMMIT');
    return updatedItem;
  } catch (err) {
    await client.query('ROLLBACK');
    logError('❌ Menu item update error:', err);
    logError('Update context:', { 
      partnerId, 
      itemId, 
      updateFields: Object.keys(updates),
      hasImageBase64: !!updates.image_base64,
      finalImageUrl: finalImageUrl || 'not set'
    });
    throw err;
  } finally {
    client.release();
  }
}

// Delete menu item
async function deleteMenuItem(partnerId, itemId) {
  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner || !partner.is_active) {
    throw new AppError(404, "Partner not found or inactive");
  }

  const deleted = await menuRepository.deleteMenuItem(partnerId, itemId);
  if (!deleted) {
    throw new AppError(404, "Menu item not found");
  }
  return { deleted: true, id: itemId };
}

module.exports = {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};

