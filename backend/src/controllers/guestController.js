/**
 * Guest CRM: list guests, guest profile, add note (partner-only)
 */
const guestRepository = require('../repositories/guestRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');

async function listGuests(req, res) {
  try {
    const { id: partnerId } = req.params;
    if (req.partnerId && req.partnerId !== partnerId) {
      return errorResponse(res, 403, 'Not authorized to view this venue\'s guests');
    }
    if (!req.partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const guests = await guestRepository.listGuestsForPartner(partnerId);
    successResponse(res, 200, 'Guests retrieved successfully', guests);
  } catch (err) {
    logError('❌ List guests error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to list guests');
  }
}

async function getGuestProfile(req, res) {
  try {
    const { id: partnerId, userId } = req.params;
    if (req.partnerId && req.partnerId !== partnerId) {
      return errorResponse(res, 403, 'Not authorized to view this guest');
    }
    if (!req.partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const profile = await guestRepository.getGuestProfileForPartner(partnerId, userId);
    if (!profile) {
      return errorResponse(res, 404, 'Guest not found');
    }
    successResponse(res, 200, 'Guest profile retrieved successfully', profile);
  } catch (err) {
    logError('❌ Get guest profile error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to get guest profile');
  }
}

async function addGuestNote(req, res) {
  try {
    const { id: partnerId, userId } = req.params;
    const { note } = req.body;
    const createdByPartnerId = req.partnerId || partnerId;
    if (!note || typeof note !== 'string' || !note.trim()) {
      return errorResponse(res, 400, 'Note text is required');
    }
    const created = await guestRepository.addGuestNote(
      partnerId,
      userId,
      note.trim(),
      createdByPartnerId
    );
    successResponse(res, 201, 'Note added successfully', created);
  } catch (err) {
    logError('❌ Add guest note error:', err);
    errorResponse(res, err.statusCode || 500, err.message || 'Failed to add note');
  }
}

module.exports = {
  listGuests,
  getGuestProfile,
  addGuestNote,
};
