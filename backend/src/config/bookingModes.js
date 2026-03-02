/**
 * Elizian Booking Architecture — Single Source of Truth
 *
 * Two structural booking types:
 * - ONLINE_TIME_SLOT: Real-time confirmed (Dining, Events)
 * - PARTNER_CONFIRMATION: Date-bound, offline time coordination (Healthcare, Spa, Wellness, Travel, Others)
 */

const ONLINE_TIME_SLOT = 'ONLINE_TIME_SLOT';
const PARTNER_CONFIRMATION = 'PARTNER_CONFIRMATION';

/**
 * Maps service_type (from partner_offers) to booking_mode.
 * Used at booking creation and for backward-compat inference.
 */
const BOOKING_CATEGORY_CONFIG = {
  dining: ONLINE_TIME_SLOT,
  restaurant: ONLINE_TIME_SLOT, // alias for dining (legacy/frontend parity)
  events: ONLINE_TIME_SLOT,
  shows: ONLINE_TIME_SLOT,
  healthcare: PARTNER_CONFIRMATION,
  'spa-and-salon': PARTNER_CONFIRMATION,
  spa: PARTNER_CONFIRMATION,
  wellness: PARTNER_CONFIRMATION,
  travel: PARTNER_CONFIRMATION,
  others: PARTNER_CONFIRMATION,
};

/**
 * Get booking_mode from service_type.
 * @param {string} serviceType - From offer (dining, events, spa, wellness, etc.)
 * @returns {string} ONLINE_TIME_SLOT | PARTNER_CONFIRMATION
 */
function getBookingModeFromServiceType(serviceType) {
  if (!serviceType || typeof serviceType !== 'string') return PARTNER_CONFIRMATION;
  const key = String(serviceType).toLowerCase().trim();
  return BOOKING_CATEGORY_CONFIG[key] ?? PARTNER_CONFIRMATION;
}

/**
 * Infer booking_mode for legacy bookings without booking_mode.
 * Rule: if booking_time exists and is meaningful → ONLINE_TIME_SLOT, else PARTNER_CONFIRMATION
 * @param {Object} booking - { booking_mode, booking_time, service_type }
 * @returns {string} ONLINE_TIME_SLOT | PARTNER_CONFIRMATION
 */
function inferBookingMode(booking) {
  if (booking?.booking_mode) return booking.booking_mode;
  const svcType = (booking?.service_type || '').toString().toLowerCase().trim();
  const modeFromService = getBookingModeFromServiceType(svcType);
  if (modeFromService) return modeFromService;
  const hasTimeSlot = booking?.booking_time && String(booking.booking_time).trim() && String(booking.booking_time) !== '12:00';
  return hasTimeSlot ? ONLINE_TIME_SLOT : PARTNER_CONFIRMATION;
}

// ─── INVENTORY vs SERVICE category types ────────────────────────
// SERVICE: Postpaid model (Dining, Spa, Wellness, Healthcare, Travel, Others)
// INVENTORY: Pre-settlement model with seat + token locking (Events; future: Hotels, Flights, Premium)
const INVENTORY = 'INVENTORY';
const SERVICE = 'SERVICE';

/**
 * Maps service_type to booking_category (SERVICE vs INVENTORY).
 * Events use INVENTORY (limited seats, pre-settlement).
 * All others use SERVICE (postpaid, no inventory loss).
 * @param {string} serviceType - From offer (dining, events, spa, wellness, etc.)
 * @returns {string} 'SERVICE' | 'INVENTORY'
 */
function getBookingCategoryFromServiceType(serviceType) {
  if (!serviceType || typeof serviceType !== 'string') return SERVICE;
  const key = String(serviceType).toLowerCase().trim();
  return key === 'events' ? INVENTORY : SERVICE;
}

module.exports = {
  ONLINE_TIME_SLOT,
  PARTNER_CONFIRMATION,
  BOOKING_CATEGORY_CONFIG,
  getBookingModeFromServiceType,
  inferBookingMode,
  INVENTORY,
  SERVICE,
  getBookingCategoryFromServiceType,
};
