const theatreService = require('../services/theatreService');
const { successResponse, errorResponse } = require('../utils/response');
const { logError } = require('../utils/logger');

// ============================================
// THEATRE ENDPOINTS
// ============================================

async function createTheatre(req, res) {
  try {
    const { name, location, contact_email, contact_phone, metadata } = req.body;
    const partnerId = req.userId; // Assuming partner auth sets userId

    const theatre = await theatreService.createTheatre({
      partnerId,
      name,
      location,
      contactEmail: contact_email,
      contactPhone: contact_phone,
      metadata
    });

    successResponse(res, 201, 'Theatre created successfully', theatre);
  } catch (err) {
    logError('Create theatre error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create theatre');
  }
}

async function getTheatre(req, res) {
  try {
    const { id } = req.params;
    const theatre = await theatreService.getTheatre(id);
    successResponse(res, 200, 'Theatre retrieved successfully', theatre);
  } catch (err) {
    logError('Get theatre error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve theatre');
  }
}

async function listTheatres(req, res) {
  try {
    const { partner_id, limit = 50, offset = 0 } = req.query;
    const theatres = await theatreService.listTheatres({
      partnerId: partner_id || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    successResponse(res, 200, 'Theatres retrieved successfully', theatres);
  } catch (err) {
    logError('List theatres error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve theatres');
  }
}

async function updateTheatre(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const theatre = await theatreService.updateTheatre(id, updates);
    successResponse(res, 200, 'Theatre updated successfully', theatre);
  } catch (err) {
    logError('Update theatre error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to update theatre');
  }
}

async function deleteTheatre(req, res) {
  try {
    const { id } = req.params;
    const result = await theatreService.deleteTheatre(id);
    successResponse(res, 200, 'Theatre deleted successfully', result);
  } catch (err) {
    logError('Delete theatre error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to delete theatre');
  }
}

// ============================================
// SCREEN ENDPOINTS
// ============================================

async function createScreen(req, res) {
  try {
    const { theatre_id, name, seating_capacity, layout } = req.body;
    const screen = await theatreService.createScreen({
      theatreId: theatre_id,
      name,
      seatingCapacity: seating_capacity || 0,
      layout
    });
    successResponse(res, 201, 'Screen created successfully', screen);
  } catch (err) {
    logError('Create screen error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create screen');
  }
}

async function getScreen(req, res) {
  try {
    const { id } = req.params;
    const screen = await theatreService.getScreen(id);
    successResponse(res, 200, 'Screen retrieved successfully', screen);
  } catch (err) {
    logError('Get screen error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve screen');
  }
}

async function listScreens(req, res) {
  try {
    const { theatre_id, limit = 50, offset = 0 } = req.query;
    const screens = await theatreService.listScreens({
      theatreId: theatre_id || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    successResponse(res, 200, 'Screens retrieved successfully', screens);
  } catch (err) {
    logError('List screens error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve screens');
  }
}

async function updateScreen(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const screen = await theatreService.updateScreen(id, updates);
    successResponse(res, 200, 'Screen updated successfully', screen);
  } catch (err) {
    logError('Update screen error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to update screen');
  }
}

// ============================================
// SEAT TEMPLATE ENDPOINTS
// ============================================

async function createSeatTemplate(req, res) {
  try {
    const { screen_id, row_label, seat_number, seat_type, price_zone, base_price, metadata } = req.body;
    const seat = await theatreService.createSeatTemplate({
      screenId: screen_id,
      rowLabel: row_label,
      seatNumber: seat_number,
      seatType: seat_type || 'standard',
      priceZone: price_zone || null,
      basePrice: base_price || null,
      metadata: metadata || {}
    });
    successResponse(res, 201, 'Seat template created successfully', seat);
  } catch (err) {
    logError('Create seat template error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create seat template');
  }
}

async function bulkCreateSeatTemplates(req, res) {
  try {
    const { screen_id, seats } = req.body;
    const result = await theatreService.bulkCreateSeatTemplates(screen_id, seats);
    successResponse(res, 201, 'Seat templates created successfully', result);
  } catch (err) {
    logError('Bulk create seat templates error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create seat templates');
  }
}

async function getSeatTemplates(req, res) {
  try {
    const { screen_id } = req.params;
    const seats = await theatreService.getSeatTemplates(screen_id);
    successResponse(res, 200, 'Seat templates retrieved successfully', seats);
  } catch (err) {
    logError('Get seat templates error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve seat templates');
  }
}

// ============================================
// SHOW ENDPOINTS
// ============================================

async function createShow(req, res) {
  try {
    const { screen_id, title, start_time, end_time, language, format, metadata } = req.body;
    const show = await theatreService.createShow({
      screenId: screen_id,
      title,
      startTime: start_time,
      endTime: end_time,
      language: language || null,
      format: format || null,
      metadata: metadata || {}
    });
    successResponse(res, 201, 'Show created successfully', show);
  } catch (err) {
    logError('Create show error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to create show');
  }
}

async function getShow(req, res) {
  try {
    const { id } = req.params;
    const show = await theatreService.getShow(id);
    successResponse(res, 200, 'Show retrieved successfully', show);
  } catch (err) {
    logError('Get show error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve show');
  }
}

async function listShows(req, res) {
  try {
    const { screen_id, theatre_id, start_date, end_date, limit = 50, offset = 0 } = req.query;
    const shows = await theatreService.listShows({
      screenId: screen_id || null,
      theatreId: theatre_id || null,
      startDate: start_date || null,
      endDate: end_date || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    successResponse(res, 200, 'Shows retrieved successfully', shows);
  } catch (err) {
    logError('List shows error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve shows');
  }
}

// ============================================
// SHOW SEAT ENDPOINTS
// ============================================

async function getShowSeatMap(req, res) {
  try {
    const { show_id } = req.params;
    const seatMap = await theatreService.getShowSeatMap(show_id);
    successResponse(res, 200, 'Show seat map retrieved successfully', seatMap);
  } catch (err) {
    logError('Get show seat map error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to retrieve seat map');
  }
}

async function reserveSeats(req, res) {
  try {
    const { show_id } = req.params;
    const { seat_template_ids, reservation_minutes = 10 } = req.body;
    const userId = req.userId;

    const result = await theatreService.reserveSeats(
      show_id,
      seat_template_ids,
      userId,
      reservation_minutes
    );
    successResponse(res, 200, 'Seats reserved successfully', result);
  } catch (err) {
    logError('Reserve seats error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to reserve seats');
  }
}

async function confirmSeatBooking(req, res) {
  try {
    const { show_id } = req.params;
    const { seat_template_ids, booking_id } = req.body;

    const result = await theatreService.confirmSeatBooking(show_id, seat_template_ids, booking_id);
    successResponse(res, 200, 'Seat booking confirmed successfully', result);
  } catch (err) {
    logError('Confirm seat booking error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to confirm seat booking');
  }
}

async function releaseSeats(req, res) {
  try {
    const { show_id } = req.params;
    const { seat_template_ids } = req.body;

    const result = await theatreService.releaseSeats(show_id, seat_template_ids);
    successResponse(res, 200, 'Seats released successfully', result);
  } catch (err) {
    logError('Release seats error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to release seats');
  }
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

