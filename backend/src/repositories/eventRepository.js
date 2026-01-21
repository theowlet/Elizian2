const { getPool } = require('../config/db');
const { enrichWithLifecycleStatus } = require('../utils/lifecycle');

const pool = getPool();

// Get event by ID with partner details
async function getEventById(eventId) {
  const result = await pool.query(`
    SELECT e.*, p.name as organizer_name, p.email as organizer_email, p.phone_number as organizer_phone
    FROM events e
    LEFT JOIN partners p ON e.venue_id = p.id
    WHERE e.id = $1
  `, [eventId]);
  return result.rows[0];
}

// Get sold tickets count for an event
async function getSoldTicketsCount(eventId) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as sold_tickets FROM event_tickets WHERE event_id = $1 AND status = $2',
      [eventId, 'active']
    );
    return parseInt(result.rows[0].sold_tickets || 0);
  } catch (err) {
    // event_tickets table might not exist
    return 0;
  }
}

// List events with enriched data (merged from menu_items)
async function listEvents({ include_expired = false } = {}) {
  const query = `
    SELECT 
      e.id,
      e.title,
      e.description,
      e.start_time,
      e.end_time,
      e.venue_id,
      e.status,
      e.created_at,
      COALESCE(mi.image_url, e.image_url) as image_url,
      COALESCE(mi.price, e.price_per_ticket) as price_per_ticket,
      COALESCE(e.booking_cap, mi.max_capacity) as booking_cap,
      COALESCE(mi.organizer_name, p.name) as organizer_name,
      p.email as organizer_email,
      p.phone_number as organizer_phone
    FROM events e
    LEFT JOIN menu_items mi ON mi.partner_id = e.venue_id AND mi.name = e.title AND mi.service_type = 'events'
    LEFT JOIN partners p ON e.venue_id = p.id
    WHERE e.status = 'active'
      AND (
        (e.end_time IS NOT NULL AND e.end_time > CURRENT_TIMESTAMP)
        OR
        (e.end_time IS NULL AND e.start_time >= CURRENT_DATE)
      )
    ORDER BY e.start_time ASC
  `;
  
  const result = await pool.query(query);
  const enrichedEvents = enrichWithLifecycleStatus(result.rows);
  
  if (!include_expired) {
    return enrichedEvents.filter(event => event.computed_status !== 'expired');
  }
  
  return enrichedEvents;
}

// Create event
async function createEvent(eventData) {
  const {
    venue_id, title, description, start_time, end_time,
    booking_cap, price_per_ticket, status = 'active', image_url
  } = eventData;

  const result = await pool.query(
    `INSERT INTO events (venue_id, title, description, start_time, end_time,
      booking_cap, price_per_ticket, status, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [venue_id, title, description, start_time, end_time,
      booking_cap, price_per_ticket, status, image_url]
  );
  return result.rows[0];
}

// Get event taxonomy (categories, tags, attributes)
async function getEventTaxonomy() {
  const categories = await pool.query(`
    SELECT ec.*, 
           COUNT(DISTINCT esc.id) as subcategory_count
    FROM event_categories ec
    LEFT JOIN event_subcategories esc ON ec.id = esc.category_id AND esc.is_active = true
    WHERE ec.is_active = true
    GROUP BY ec.id
    ORDER BY ec.display_order ASC, ec.name ASC
  `);

  const tags = await pool.query(`
    SELECT et.*, COUNT(etm.event_id) as usage_count
    FROM event_tags et
    LEFT JOIN event_tag_mappings etm ON et.id = etm.tag_id
    WHERE et.is_active = true
    GROUP BY et.id
    ORDER BY usage_count DESC, et.name ASC
  `);

  // Event attributes constants
  const attributes = {
    formats: ['In-person', 'Virtual/Online', 'Hybrid (In-person + Virtual)'],
    durations: ['Under 2 hours', '2-4 hours', '4-8 hours', 'Full day', 'Multi-day'],
    audiences: ['All ages', 'Kids (0-12)', 'Teens (13-17)', 'Adults (18+)', 'Seniors (65+)', 'Families'],
    price_ranges: ['Free', '₹0-500', '₹500-2000', '₹2000-5000', '₹5000+'],
    capacities: ['Under 50', '50-200', '200-500', '500-2000', '2000+'],
    atmospheres: ['Formal', 'Casual', 'Party/Festive', 'Professional', 'Relaxed'],
    accessibility: ['Wheelchair accessible', 'Hearing assistance available', 'Visual assistance available', 'Sign language interpreter', 'Sensory-friendly']
  };

  return {
    categories: categories.rows,
    tags: tags.rows,
    attributes
  };
}

// Create event ticket
async function createEventTicket(ticketData) {
  const {
    event_id, user_id, ticket_code, qr_code, attendee_name,
    attendee_email, attendee_phone, price_paid, payment_method, payment_status
  } = ticketData;

  const result = await pool.query(
    `INSERT INTO event_tickets (event_id, user_id, ticket_code, qr_code, attendee_name, 
      attendee_email, attendee_phone, price_paid, payment_method, payment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [event_id, user_id, ticket_code, qr_code, attendee_name,
      attendee_email, attendee_phone, price_paid, payment_method, payment_status]
  );
  return result.rows[0];
}

// Get user's tickets
async function getUserTickets(userId) {
  const result = await pool.query(`
    SELECT et.*, e.title as event_title, e.start_time, e.end_time,
           p.name as organizer_name
    FROM event_tickets et
    JOIN events e ON et.event_id = e.id
    LEFT JOIN partners p ON e.venue_id = p.id
    WHERE et.user_id = $1
    ORDER BY e.start_time DESC
  `, [userId]);
  return result.rows;
}

// Get ticket by code
async function getTicketByCode(ticketCode) {
  const result = await pool.query(
    'SELECT et.*, e.title as event_title FROM event_tickets et JOIN events e ON et.event_id = e.id WHERE et.ticket_code = $1',
    [ticketCode]
  );
  return result.rows[0];
}

// Update ticket check-in status
async function checkInTicket(ticketId) {
  const result = await pool.query(
    `UPDATE event_tickets 
     SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [ticketId]
  );
  return result.rows[0];
}

module.exports = {
  getEventById,
  getSoldTicketsCount,
  listEvents,
  createEvent,
  getEventTaxonomy,
  createEventTicket,
  getUserTickets,
  getTicketByCode,
  checkInTicket
};

