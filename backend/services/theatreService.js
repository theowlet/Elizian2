const { getPool } = require('../src/config/db');
const { AppError } = require('../utils/response');
const { log, logError } = require('../utils/logger');

const pool = getPool();

// ============================================
// THEATRE MANAGEMENT
// ============================================

async function createTheatre({ partnerId, name, location, contactEmail, contactPhone, metadata = {} }) {
  if (!name) {
    throw new AppError(400, 'Theatre name is required');
  }

  const result = await pool.query(
    `INSERT INTO theatres (partner_id, name, location, contact_email, contact_phone, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [partnerId || null, name, location || null, contactEmail || null, contactPhone || null, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

async function getTheatre(theatreId) {
  const result = await pool.query(
    `SELECT t.*, p.name as partner_name
     FROM theatres t
     LEFT JOIN partners p ON t.partner_id = p.id
     WHERE t.id = $1`,
    [theatreId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Theatre not found');
  }

  return result.rows[0];
}

async function listTheatres({ partnerId = null, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT t.*, p.name as partner_name,
           (SELECT COUNT(*) FROM screens s WHERE s.theatre_id = t.id) as screen_count
    FROM theatres t
    LEFT JOIN partners p ON t.partner_id = p.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (partnerId) {
    paramCount++;
    query += ` AND t.partner_id = $${paramCount}`;
    params.push(partnerId);
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

async function updateTheatre(theatreId, updates) {
  const allowedFields = ['name', 'location', 'contact_email', 'contact_phone', 'metadata'];
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      paramCount++;
      if (key === 'metadata' && typeof value === 'object') {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }

  paramCount++;
  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(theatreId);

  const result = await pool.query(
    `UPDATE theatres SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Theatre not found');
  }

  return result.rows[0];
}

async function deleteTheatre(theatreId) {
  const result = await pool.query('DELETE FROM theatres WHERE id = $1 RETURNING id', [theatreId]);
  if (result.rows.length === 0) {
    throw new AppError(404, 'Theatre not found');
  }
  return { deleted: true, id: theatreId };
}

// ============================================
// SCREEN MANAGEMENT
// ============================================

async function createScreen({ theatreId, name, seatingCapacity = 0, layout = null }) {
  if (!theatreId || !name) {
    throw new AppError(400, 'Theatre ID and screen name are required');
  }

  // Verify theatre exists
  await getTheatre(theatreId);

  const result = await pool.query(
    `INSERT INTO screens (theatre_id, name, seating_capacity, layout)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [theatreId, name, seatingCapacity, layout ? JSON.stringify(layout) : null]
  );

  return result.rows[0];
}

async function getScreen(screenId) {
  const result = await pool.query(
    `SELECT s.*, t.name as theatre_name, t.partner_id
     FROM screens s
     JOIN theatres t ON s.theatre_id = t.id
     WHERE s.id = $1`,
    [screenId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Screen not found');
  }

  return result.rows[0];
}

async function listScreens({ theatreId = null, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT s.*, t.name as theatre_name,
           (SELECT COUNT(*) FROM seat_templates st WHERE st.screen_id = s.id) as seat_count
    FROM screens s
    JOIN theatres t ON s.theatre_id = t.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (theatreId) {
    paramCount++;
    query += ` AND s.theatre_id = $${paramCount}`;
    params.push(theatreId);
  }

  query += ` ORDER BY s.name ASC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

async function updateScreen(screenId, updates) {
  const allowedFields = ['name', 'seating_capacity', 'layout'];
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      paramCount++;
      if (key === 'layout' && typeof value === 'object') {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }

  paramCount++;
  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(screenId);

  const result = await pool.query(
    `UPDATE screens SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Screen not found');
  }

  return result.rows[0];
}

// ============================================
// SEAT TEMPLATE MANAGEMENT
// ============================================

async function createSeatTemplate({ screenId, rowLabel, seatNumber, seatType = 'standard', priceZone = null, basePrice = null, metadata = {} }) {
  if (!screenId || !rowLabel || seatNumber === undefined) {
    throw new AppError(400, 'Screen ID, row label, and seat number are required');
  }

  // Verify screen exists
  await getScreen(screenId);

  const result = await pool.query(
    `INSERT INTO seat_templates (screen_id, row_label, seat_number, seat_type, price_zone, base_price, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (screen_id, row_label, seat_number) DO UPDATE
     SET seat_type = EXCLUDED.seat_type,
         price_zone = EXCLUDED.price_zone,
         base_price = EXCLUDED.base_price,
         metadata = EXCLUDED.metadata
     RETURNING *`,
    [screenId, rowLabel, seatNumber, seatType, priceZone, basePrice, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

async function bulkCreateSeatTemplates(screenId, seats) {
  if (!Array.isArray(seats) || seats.length === 0) {
    throw new AppError(400, 'Seats array is required');
  }

  await getScreen(screenId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing seats for this screen
    await client.query('DELETE FROM seat_templates WHERE screen_id = $1', [screenId]);

    // Insert new seats
    for (const seat of seats) {
      await client.query(
        `INSERT INTO seat_templates (screen_id, row_label, seat_number, seat_type, price_zone, base_price, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          screenId,
          seat.row_label,
          seat.seat_number,
          seat.seat_type || 'standard',
          seat.price_zone || null,
          seat.base_price || null,
          JSON.stringify(seat.metadata || {})
        ]
      );
    }

    // Update screen seating capacity
    const seatCount = seats.length;
    await client.query(
      'UPDATE screens SET seating_capacity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [seatCount, screenId]
    );

    await client.query('COMMIT');
    return { created: seatCount, screen_id: screenId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getSeatTemplates(screenId) {
  const result = await pool.query(
    `SELECT * FROM seat_templates
     WHERE screen_id = $1
     ORDER BY row_label ASC, seat_number ASC`,
    [screenId]
  );

  return result.rows;
}

// ============================================
// SHOW MANAGEMENT
// ============================================

async function createShow({ screenId, title, startTime, endTime, language = null, format = null, metadata = {} }) {
  if (!screenId || !title || !startTime || !endTime) {
    throw new AppError(400, 'Screen ID, title, start time, and end time are required');
  }

  if (new Date(startTime) >= new Date(endTime)) {
    throw new AppError(400, 'End time must be after start time');
  }

  // Verify screen exists
  await getScreen(screenId);

  // Check for overlapping shows on the same screen
  const overlapCheck = await pool.query(
    `SELECT id, title, start_time, end_time
     FROM shows
     WHERE screen_id = $1
     AND (
       (start_time <= $2 AND end_time > $2) OR
       (start_time < $3 AND end_time >= $3) OR
       (start_time >= $2 AND end_time <= $3)
     )`,
    [screenId, startTime, endTime]
  );

  if (overlapCheck.rows.length > 0) {
    throw new AppError(409, 'Show time overlaps with existing show');
  }

  const result = await pool.query(
    `INSERT INTO shows (screen_id, title, start_time, end_time, language, format, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [screenId, title, startTime, endTime, language, format, JSON.stringify(metadata)]
  );

  const show = result.rows[0];

  // Initialize show_seats from seat_templates
  await initializeShowSeats(show.id, screenId);

  return show;
}

async function initializeShowSeats(showId, screenId) {
  const seatTemplates = await getSeatTemplates(screenId);

  if (seatTemplates.length === 0) {
    log(`⚠️ No seat templates found for screen ${screenId}, skipping show_seats initialization`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const template of seatTemplates) {
      await client.query(
        `INSERT INTO show_seats (show_id, seat_template_id, status, price)
         VALUES ($1, $2, 'available', $3)
         ON CONFLICT (show_id, seat_template_id) DO NOTHING`,
        [showId, template.id, template.base_price || null]
      );
    }

    await client.query('COMMIT');
    log(`✅ Initialized ${seatTemplates.length} seats for show ${showId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Failed to initialize show seats:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function getShow(showId) {
  const result = await pool.query(
    `SELECT s.*, sc.name as screen_name, sc.theatre_id, t.name as theatre_name
     FROM shows s
     JOIN screens sc ON s.screen_id = sc.id
     JOIN theatres t ON sc.theatre_id = t.id
     WHERE s.id = $1`,
    [showId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Show not found');
  }

  return result.rows[0];
}

async function listShows({ screenId = null, theatreId = null, startDate = null, endDate = null, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT s.*, sc.name as screen_name, sc.theatre_id, t.name as theatre_name,
           (SELECT COUNT(*) FROM show_seats ss WHERE ss.show_id = s.id AND ss.status = 'available') as available_seats,
           (SELECT COUNT(*) FROM show_seats ss WHERE ss.show_id = s.id AND ss.status = 'booked') as booked_seats
    FROM shows s
    JOIN screens sc ON s.screen_id = sc.id
    JOIN theatres t ON sc.theatre_id = t.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 0;

  if (screenId) {
    paramCount++;
    query += ` AND s.screen_id = $${paramCount}`;
    params.push(screenId);
  }

  if (theatreId) {
    paramCount++;
    query += ` AND sc.theatre_id = $${paramCount}`;
    params.push(theatreId);
  }

  if (startDate) {
    paramCount++;
    query += ` AND s.start_time >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND s.start_time <= $${paramCount}`;
    params.push(endDate);
  }

  query += ` ORDER BY s.start_time ASC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

// ============================================
// SHOW SEAT AVAILABILITY & BOOKING
// ============================================

async function getShowSeatMap(showId) {
  const show = await getShow(showId);

  const result = await pool.query(
    `SELECT 
       ss.id as show_seat_id,
       ss.status,
       ss.price,
       ss.reservation_expires_at,
       ss.booking_id,
       st.id as seat_template_id,
       st.row_label,
       st.seat_number,
       st.seat_type,
       st.price_zone,
       st.base_price,
       st.metadata
     FROM show_seats ss
     JOIN seat_templates st ON ss.seat_template_id = st.id
     WHERE ss.show_id = $1
     ORDER BY st.row_label ASC, st.seat_number ASC`,
    [showId]
  );

  return {
    show: {
      id: show.id,
      title: show.title,
      start_time: show.start_time,
      end_time: show.end_time,
      screen_name: show.screen_name,
      theatre_name: show.theatre_name
    },
    seats: result.rows.map(row => ({
      show_seat_id: row.show_seat_id,
      seat_template_id: row.seat_template_id,
      row: row.row_label,
      number: row.seat_number,
      type: row.seat_type,
      price_zone: row.price_zone,
      price: parseFloat(row.price || row.base_price || 0),
      status: row.status,
      reservation_expires_at: row.reservation_expires_at,
      booking_id: row.booking_id,
      metadata: row.metadata
    }))
  };
}

async function reserveSeats(showId, seatTemplateIds, userId, reservationMinutes = 10) {
  if (!Array.isArray(seatTemplateIds) || seatTemplateIds.length === 0) {
    throw new AppError(400, 'Seat template IDs array is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock seats for update
    const seatsResult = await client.query(
      `SELECT ss.id, ss.status, ss.reservation_expires_at, st.row_label, st.seat_number
       FROM show_seats ss
       JOIN seat_templates st ON ss.seat_template_id = st.id
       WHERE ss.show_id = $1
       AND ss.seat_template_id = ANY($2::uuid[])
       FOR UPDATE`,
      [showId, seatTemplateIds]
    );

    if (seatsResult.rows.length !== seatTemplateIds.length) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'One or more seats not found');
    }

    // Check availability
    const unavailable = seatsResult.rows.filter(
      s => s.status !== 'available' || (s.reservation_expires_at && new Date(s.reservation_expires_at) > new Date())
    );

    if (unavailable.length > 0) {
      await client.query('ROLLBACK');
      const seatInfo = unavailable.map(s => `${s.row_label}${s.seat_number}`).join(', ');
      throw new AppError(409, `Seats ${seatInfo} are not available`);
    }

    // Reserve seats
    const expiresAt = new Date(Date.now() + reservationMinutes * 60 * 1000);
    await client.query(
      `UPDATE show_seats
       SET status = 'reserved',
           reservation_expires_at = $1
       WHERE show_id = $2
       AND seat_template_id = ANY($3::uuid[])`,
      [expiresAt, showId, seatTemplateIds]
    );

    await client.query('COMMIT');
    return { reserved: seatTemplateIds.length, expires_at: expiresAt };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function confirmSeatBooking(showId, seatTemplateIds, bookingId) {
  if (!Array.isArray(seatTemplateIds) || seatTemplateIds.length === 0 || !bookingId) {
    throw new AppError(400, 'Seat template IDs and booking ID are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE show_seats
       SET status = 'booked',
           booking_id = $1,
           reservation_expires_at = NULL
       WHERE show_id = $2
       AND seat_template_id = ANY($3::uuid[])
       AND status IN ('available', 'reserved')`,
      [bookingId, showId, seatTemplateIds]
    );

    await client.query('COMMIT');
    return { confirmed: seatTemplateIds.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function releaseSeats(showId, seatTemplateIds) {
  if (!Array.isArray(seatTemplateIds) || seatTemplateIds.length === 0) {
    throw new AppError(400, 'Seat template IDs array is required');
  }

  await pool.query(
    `UPDATE show_seats
     SET status = 'available',
         reservation_expires_at = NULL,
         booking_id = NULL
     WHERE show_id = $1
     AND seat_template_id = ANY($2::uuid[])
     AND status = 'reserved'`,
    [showId, seatTemplateIds]
  );

  return { released: seatTemplateIds.length };
}

module.exports = {
  // Theatres
  createTheatre,
  getTheatre,
  listTheatres,
  updateTheatre,
  deleteTheatre,
  // Screens
  createScreen,
  getScreen,
  listScreens,
  updateScreen,
  // Seat Templates
  createSeatTemplate,
  bulkCreateSeatTemplates,
  getSeatTemplates,
  // Shows
  createShow,
  getShow,
  listShows,
  // Show Seats
  getShowSeatMap,
  reserveSeats,
  confirmSeatBooking,
  releaseSeats
};

