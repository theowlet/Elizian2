const eventRepository = require('../repositories/eventRepository');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const tokenService = require('./tokenService');
const { randomUUID } = require('crypto');
const { handleImageUpload, deleteOldImage } = require('../utils/imageUpload');

// Helper: Handle image upload for events (delegates to shared utility)
function handleEventImageUpload(image_base64, image_filename) {
  return handleImageUpload(image_base64, image_filename, 'events', 'event');
}

// Get event taxonomy
async function getEventTaxonomy() {
  return await eventRepository.getEventTaxonomy();
}

// List events
async function listEvents(filters = {}) {
  return await eventRepository.listEvents(filters);
}

// Get event by ID
async function getEventById(eventId) {
  const event = await eventRepository.getEventById(eventId);
  if (!event) {
    throw new AppError(404, "Event not found");
  }

  // Get ticket sales count
  const soldTickets = await eventRepository.getSoldTicketsCount(eventId);
  event.sold_tickets = soldTickets;
  event.available_tickets = event.booking_cap ? event.booking_cap - soldTickets : null;

  return event;
}

// Create event
async function createEvent(eventData) {
  const { title, start_time } = eventData;
  if (!title || !start_time) {
    throw new AppError(400, "Title and start time are required");
  }

  // Disallow past-dated events
  if (new Date(start_time) < new Date()) {
    throw new AppError(400, "Start time cannot be in the past");
  }

  // Handle image upload
  let finalImageUrl = eventData.image_url || null;
  if (!finalImageUrl && eventData.image_base64) {
    finalImageUrl = handleEventImageUpload(eventData.image_base64, eventData.image_filename);
  }

  return await eventRepository.createEvent({
    ...eventData,
    image_url: finalImageUrl
  });
}

// Purchase event ticket
async function purchaseTicket(eventId, ticketData, userId = null) {
  const { attendee_name, attendee_email, attendee_phone, payment_method = 'online' } = ticketData;

  if (!attendee_name || !attendee_email) {
    throw new AppError(400, "Attendee name and email are required");
  }

  // Get event details
  const event = await eventRepository.getEventById(eventId);
  if (!event || event.status !== 'active') {
    throw new AppError(404, "Event not found or inactive");
  }

  // LIFECYCLE CHECK: Verify event hasn't expired
  if (event.end_time && new Date(event.end_time) < new Date()) {
    throw new AppError(400, "This event has expired and tickets are no longer available.", {
      lifecycle_status: 'expired',
      end_time: event.end_time
    });
  }

  // Check capacity
  if (event.booking_cap) {
    const soldTickets = await eventRepository.getSoldTicketsCount(eventId);
    if (soldTickets >= event.booking_cap) {
      throw new AppError(400, "Event is sold out");
    }
  }

  // Calculate ticket price
  let ticketPrice = parseFloat(event.price_per_ticket) || 0;

  // Check for early bird pricing
  if (event.early_bird_price && event.early_bird_end_date) {
    const today = new Date().toISOString().split('T')[0];
    if (today <= event.early_bird_end_date) {
      ticketPrice = parseFloat(event.early_bird_price) || ticketPrice;
    }
  }

  // Generate ticket code and QR code
  const ticketCode = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const qrCode = `https://eznet.app/ticket/${ticketCode}`;

  // Create ticket
  const ticket = await eventRepository.createEventTicket({
    event_id: eventId,
    user_id: userId,
    ticket_code: ticketCode,
    qr_code: qrCode,
    attendee_name,
    attendee_email,
    attendee_phone,
    price_paid: ticketPrice,
    payment_method,
    payment_status: payment_method === 'offline' ? 'pending' : 'paid'
  });

  // Award tokens if user is logged in
  if (userId) {
    try {
      const tokensEarned = await tokenService.awardTokens(
        userId,
        ticketPrice,
        'event_ticket_purchase',
        eventId,
        null,
        `Ticket purchase for ${event.title}`
      );
      ticket.tokens_earned = tokensEarned;
    } catch (tokenErr) {
      logError('Token award failed for ticket purchase:', tokenErr);
      // Don't fail the ticket purchase if token award fails
    }
  }

  return ticket;
}

// Get user's tickets
async function getUserTickets(userId) {
  return await eventRepository.getUserTickets(userId);
}

// Check-in ticket
async function checkInTicket(ticketCode) {
  const ticket = await eventRepository.getTicketByCode(ticketCode);
  if (!ticket) {
    throw new AppError(404, "Ticket not found");
  }

  if (ticket.checked_in) {
    throw new AppError(400, "Ticket already checked in");
  }

  return await eventRepository.checkInTicket(ticket.id);
}

module.exports = {
  getEventTaxonomy,
  listEvents,
  getEventById,
  createEvent,
  purchaseTicket,
  getUserTickets,
  checkInTicket
};

