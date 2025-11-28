const eventService = require('../services/eventService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../utils/jwt');

// Get event taxonomy
async function getTaxonomy(req, res) {
  try {
    const taxonomy = await eventService.getEventTaxonomy();
    successResponse(res, 200, 'Event taxonomy retrieved successfully', taxonomy);
  } catch (err) {
    logError('Taxonomy fetch error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch taxonomy');
  }
}

// List events
async function listEvents(req, res) {
  try {
    const { include_expired = 'false' } = req.query;
    const events = await eventService.listEvents({ include_expired: include_expired === 'true' });
    successResponse(res, 200, "Events retrieved successfully", events);
  } catch (err) {
    logError("❌ Events fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch events");
  }
}

// Get single event
async function getEvent(req, res) {
  try {
    const { id } = req.params;
    const event = await eventService.getEventById(id);
    successResponse(res, 200, "Event retrieved successfully", event);
  } catch (err) {
    logError("❌ Event fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch event");
  }
}

// Create event
async function createEvent(req, res) {
  try {
    const event = await eventService.createEvent(req.body);
    successResponse(res, 201, "Event created successfully", event);
  } catch (err) {
    logError("❌ Event creation error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to create event");
  }
}

// Purchase event ticket
async function purchaseTicket(req, res) {
  try {
    const { id } = req.params;
    
    // Check if user is authenticated
    let userId = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      }
    } catch (error) {
      // Token is invalid or not provided - userId remains null
      log('⚠️ No valid authentication token provided for ticket purchase');
    }

    const ticket = await eventService.purchaseTicket(id, req.body, userId);
    successResponse(res, 201, "Ticket purchased successfully", ticket);
  } catch (err) {
    logError("❌ Ticket purchase error:", err);
    if (err.lifecycle_status) {
      res.status(400).json({
        success: false,
        message: err.message,
        lifecycle_status: err.lifecycle_status,
        end_time: err.end_time
      });
    } else {
      errorResponse(res, err.statusCode || 500, err.message || "Failed to purchase ticket");
    }
  }
}

// Get user's tickets
async function getUserTickets(req, res) {
  try {
    const { id } = req.params;
    const tickets = await eventService.getUserTickets(id);
    successResponse(res, 200, "Tickets retrieved successfully", tickets);
  } catch (err) {
    logError("❌ Tickets fetch error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to fetch tickets");
  }
}

// Check-in ticket
async function checkInTicket(req, res) {
  try {
    const { ticketCode } = req.params;
    const ticket = await eventService.checkInTicket(ticketCode);
    successResponse(res, 200, "Ticket checked in successfully", ticket);
  } catch (err) {
    logError("❌ Ticket check-in error:", err);
    errorResponse(res, err.statusCode || 500, err.message || "Failed to check in ticket");
  }
}

module.exports = {
  getTaxonomy,
  listEvents,
  getEvent,
  createEvent,
  purchaseTicket,
  getUserTickets,
  checkInTicket
};

