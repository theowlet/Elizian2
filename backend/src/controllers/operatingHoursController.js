const operatingHoursService = require('../services/operatingHoursService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Operating Hours Controller
 *
 * Handles partner-facing endpoints for managing venue operating hours,
 * special closures, and booking acceptance status.
 */

/**
 * Get partner's operating hours for the week
 * GET /api/v1/partners/me/operating-hours
 */
async function getHours(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const hours = await operatingHoursService.getPartnerOperatingHours(partnerId);
    return successResponse(res, 200, 'Success', hours);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Update partner's operating hours
 * PUT /api/v1/partner/me/operating-hours
 * Body: { hours: [{ day_of_week: 0, opens_at: '09:00', closes_at: '21:00', is_closed: false, break_start: null, break_end: null }, ...] }
 */
async function updateHours(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const { hours } = req.body;

    if (!hours || !Array.isArray(hours)) {
      return errorResponse(res, 400, 'Invalid hours data. Expected array.');
    }
    if (hours.length !== 7) {
      return errorResponse(res, 400, 'Hours data must contain exactly 7 days (Sunday–Saturday).');
    }

    // Validate hours data structure
    // Accept both HH:MM and HH:MM:SS (PostgreSQL TIME columns return HH:MM:SS)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    for (const dayData of hours) {
      const day = dayData.day_of_week;
      if (typeof day !== 'number' && typeof day !== 'string') {
        return errorResponse(res, 400, 'Invalid day_of_week. Must be 0-6.');
      }
      const dayNum = Number(day);
      if (Number.isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
        return errorResponse(res, 400, 'Invalid day_of_week. Must be 0-6.');
      }

      if (!dayData.is_closed) {
        if (!dayData.opens_at || !dayData.closes_at) {
          return errorResponse(res, 400, `Day ${dayNum} requires opens_at and closes_at times.`);
        }
        if (!timeRegex.test(String(dayData.opens_at)) || !timeRegex.test(String(dayData.closes_at))) {
          return errorResponse(res, 400, 'Time must be in HH:MM format (24-hour).');
        }
        if (dayData.break_start || dayData.break_end) {
          if (!dayData.break_start || !dayData.break_end) {
            return errorResponse(res, 400, 'Both break_start and break_end must be provided.');
          }
          if (!timeRegex.test(String(dayData.break_start)) || !timeRegex.test(String(dayData.break_end))) {
            return errorResponse(res, 400, 'Break times must be in HH:MM format.');
          }
        }
      }
    }

    const result = await operatingHoursService.setPartnerHours(partnerId, hours);
    return successResponse(res, 200, 'Operating hours updated successfully', result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Add special closure (holiday, temporary closure)
 * POST /api/v1/partner/me/special-closures
 * Body: { closure_date: 'YYYY-MM-DD', closure_reason: 'Christmas Day', is_full_day: true, custom_opens_at?: '10:00', custom_closes_at?: '18:00' }
 */
async function addClosure(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const { closure_date, closure_reason, is_full_day, custom_opens_at, custom_closes_at } = req.body;

    if (!closure_date) {
      return errorResponse(res, 400, 'closure_date is required (YYYY-MM-DD format).');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(closure_date)) {
      return errorResponse(res, 400, 'closure_date must be in YYYY-MM-DD format.');
    }

    // If partial closure, validate custom hours
    if (is_full_day === false) {
      if (!custom_opens_at || !custom_closes_at) {
        return errorResponse(res, 400, 'Partial closures require custom_opens_at and custom_closes_at.');
      }

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(custom_opens_at) || !timeRegex.test(custom_closes_at)) {
        return errorResponse(res, 400, 'Custom hours must be in HH:MM format.');
      }
    }

    // Only set created_by if userId looks like a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const closureData = {
      closure_date,
      closure_reason: closure_reason || null,
      is_full_day: is_full_day !== false, // Default true
      custom_opens_at: custom_opens_at || null,
      custom_closes_at: custom_closes_at || null,
      created_by: (req.userId && uuidRegex.test(req.userId)) ? req.userId : null
    };

    const closure = await operatingHoursService.addSpecialClosure(partnerId, closureData);
    return successResponse(res, 201, 'Special closure added successfully', closure);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get list of special closures
 * GET /api/v1/partner/me/special-closures?future_only=true
 */
async function listClosures(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const futureOnly = req.query.future_only !== 'false'; // Default true
    const closures = await operatingHoursService.getSpecialClosures(partnerId, futureOnly);
    return successResponse(res, 200, 'Success', closures);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Delete special closure
 * DELETE /api/v1/partner/me/special-closures/:id
 */
async function deleteClosure(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, 'Closure ID is required.');
    }

    const deleted = await operatingHoursService.deleteSpecialClosure(id, partnerId);
    return successResponse(res, 200, 'Special closure deleted successfully', deleted);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Toggle accepting bookings flag
 * POST /api/v1/partner/me/accepting-bookings
 * Body: { accepting: true/false }
 */
async function toggleAccepting(req, res) {
  try {
    const partnerId = req.partnerId;
    if (!partnerId) {
      return errorResponse(res, 401, 'Partner authentication required');
    }
    const { accepting } = req.body;

    if (typeof accepting !== 'boolean') {
      return errorResponse(res, 400, 'accepting must be a boolean (true/false).');
    }

    const result = await operatingHoursService.toggleAcceptingBookings(partnerId, accepting);
    return successResponse(
      res,
      200,
      `Bookings ${accepting ? 'resumed' : 'paused'} successfully`,
      result
    );
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get public operating hours for a partner (used by customers)
 * GET /api/v1/partner/:id/operating-hours
 */
async function getPublicHours(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, 'Partner ID is required.');
    }

    const hours = await operatingHoursService.getPartnerOperatingHours(id);
    return successResponse(res, 200, 'Success', hours);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

/**
 * Get opening hours for a specific date (considering special closures)
 * GET /api/v1/partner/:id/operating-hours/:date
 * Example: /api/v1/partner/123/operating-hours/2026-12-25
 */
async function getHoursForDate(req, res) {
  try {
    const { id, date } = req.params;

    if (!id || !date) {
      return errorResponse(res, 400, 'Partner ID and date are required.');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return errorResponse(res, 400, 'Date must be in YYYY-MM-DD format.');
    }

    const hours = await operatingHoursService.getOpeningHoursForDate(id, date);
    return successResponse(res, 200, 'Success', hours);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.message || 'Request failed');
  }
}

module.exports = {
  getHours,
  updateHours,
  addClosure,
  listClosures,
  deleteClosure,
  toggleAccepting,
  getPublicHours,
  getHoursForDate
};
