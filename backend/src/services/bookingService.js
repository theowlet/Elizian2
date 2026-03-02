const { getPool } = require('../config/db');
const bookingRepository = require('../repositories/bookingRepository');
const transactionRepository = require('../repositories/transactionRepository');
const eventRepository = require('../repositories/eventRepository');
const offerRepository = require('../repositories/offerRepository');
const partnerRepository = require('../repositories/partnerRepository');
const userRepository = require('../repositories/userRepository');
const settingsRepository = require('../repositories/settingsRepository');
const tokenService = require('./tokenService');
const theatreService = require('../../services/theatreService');
const bankOfferService = require('./bankOfferService');
const reservationService = require('./reservationService');
const preOrderService = require('./preOrderService');
const bookingValidation = require('./bookingValidation');
const slotCapacityService = require('./slotCapacityService');
const waitlistService = require('./waitlistService');
const { writeAuditWithExecutor } = require('../utils/audit');
const eventSlotsRepository = require('../repositories/eventSlotsRepository');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { emitRealtimeEvent, emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');
const { generateAndUploadQRCode } = require('../utils/qrCodeGenerator');
const { normalizeTierName } = require('../utils/tierNames');
const { getNowInTZ, parseDateInTZ } = require('../utils/timeService');
const { normalizeCoPayPercentage } = require('./redemptionCalculationService');
const { getBookingModeFromServiceType, getBookingCategoryFromServiceType } = require('../config/bookingModes');

const pool = getPool();

// Create a booking (event, offer, or show)
async function createBooking(bookingData) {
  const client = await pool.connect();
  try {
    const { 
      event_id, 
      offer_id, 
      show_id, 
      seat_template_ids, 
      num_tickets = 1, 
      special_requests, 
      ezt_to_redeem, 
      user_id,
      // New fields for bank offers, reservations, pre-orders
      bank_offer_id,
      bank_offer_rule_id,
      reservation_data, // { date, time, partySize, occasion, specialRequests, seatingPreference }
      pre_order_data, // { items, specialInstructions, dietaryRequirements } - Echelon tier only
      // Direct booking date/time (for events, passed from frontend)
      booking_date,
      booking_time,
      booked_at_client // Client ISO timestamp for accurate "Booked on" display in IST
    } = bookingData;

    let offer = null; // Set in offer_id branch; used for max_redemptions_per_slot in validation

    // Validate required fields
    if (!user_id) {
      throw new AppError(400, "User ID is required for booking");
    }

    if (!event_id && !offer_id && !show_id) {
      throw new AppError(400, "Either event_id, offer_id, or show_id is required");
    }

    await client.query('BEGIN');

    let bookingPayload = { user_id, num_tickets, special_requests };
    let amount = 0;
    let partner_id = null;
    let serviceType = null; // Track service type to decide if hours validation is required
    let eventStartTimeForDefault = null; // For event_id: use event.start_time when user didn't send date/time
    let commission_percentage = 10.0;

    // Get commission percentage from system settings (with timeout and fallback)
    try {
      // Set a timeout for the settings query to prevent hanging
      const settingsPromise = settingsRepository.getSystemSetting('commission_percentage');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings query timeout')), 5000)
      );
      
      const commissionSetting = await Promise.race([settingsPromise, timeoutPromise]);
      if (commissionSetting) {
        commission_percentage = parseFloat(commissionSetting) || 10.0;
      }
    } catch (settingsError) {
      // If settings query fails or times out, use default commission percentage
      log(`⚠️ Could not fetch commission setting, using default 10%: ${settingsError.message}`);
      commission_percentage = 10.0;
    }

    if (event_id) {
      // Event booking
      const event = await eventRepository.getEventById(event_id);
      if (!event) {
        await client.query('ROLLBACK');
        throw new AppError(404, "Event not found or not active");
      }

      partner_id = event.partner_id;
      serviceType = 'events';
      eventStartTimeForDefault = event.start_time || null;

      // Check if event has passed
      if (event.start_time && new Date(event.start_time) < new Date()) {
        await client.query('ROLLBACK');
        throw new AppError(400, "Cannot book for past events");
      }

      // Check available tickets
      const bookedCount = await bookingRepository.countBookedTicketsForEvent(event_id);
      const availableTickets = (event.booking_cap || 0) - bookedCount;

      if (num_tickets > availableTickets) {
        await client.query('ROLLBACK');
        throw new AppError(400, `Only ${availableTickets} tickets available`);
      }

      amount = (parseFloat(event.price_per_ticket) || 0) * num_tickets;
      bookingPayload.event_id = event_id;
      // INVENTORY model: events use temp_reserved with token locking + dynamic expiry
      bookingPayload.status = 'temp_reserved';
      bookingPayload.booking_category = 'INVENTORY';
      bookingPayload.platform_handles_payment = false;
    } else if (offer_id) {
      // Offer booking: fetch without partner filter first to return a specific error
      offer = await offerRepository.getOfferById(offer_id, false);
      if (!offer) {
        const raw = await offerRepository.getOfferByIdRaw(offer_id);
        if (!raw) {
          await client.query('ROLLBACK');
          throw new AppError(404, "Offer not found");
        }
        const status = (raw.status && String(raw.status).toLowerCase().trim()) || '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isEvent = (raw.service_type && String(raw.service_type).toLowerCase().trim()) === 'events';
        if (status !== 'active' && !raw.is_active) {
          await client.query('ROLLBACK');
          throw new AppError(400, "This deal is not active. It may be draft, paused, or rejected. Please select another deal.");
        }
        // For non-events only: deal must have started. Events allow pre-booking (Pre-book Now).
        if (!isEvent && raw.start_date && new Date(raw.start_date).toDateString() > today.toDateString()) {
          await client.query('ROLLBACK');
          throw new AppError(400, "This deal is not yet open for booking. Please try again from the start date.");
        }
        if (raw.end_date && new Date(raw.end_date).toDateString() < today.toDateString()) {
          await client.query('ROLLBACK');
          throw new AppError(400, "This deal's booking period has ended. Please select another deal.");
        }
        const pStatus = (raw.partner_status && String(raw.partner_status).toLowerCase().trim()) || '';
        if (['suspended', 'rejected'].includes(pStatus)) {
          await client.query('ROLLBACK');
          throw new AppError(400, "This partner is not accepting bookings. Please select another deal.");
        }
        // Pre-book: use raw as offer so booking can proceed (event within deal window; operating hours validated later).
        offer = raw;
      }
      const offerStatus = (offer.status && String(offer.status).toLowerCase().trim()) || '';
      if (offerStatus !== 'active') {
        await client.query('ROLLBACK');
        throw new AppError(400, "This deal is not active and cannot be booked. Please select another deal.");
      }
      const now = new Date();
      // Events allow pre-booking (Pre-book Now): do not require current time to be after start_date.
      const isEventOffer = (offer.service_type && String(offer.service_type).toLowerCase().trim()) === 'events';
      if (!isEventOffer && offer.start_date && new Date(offer.start_date) > now) {
        await client.query('ROLLBACK');
        throw new AppError(400, "This deal is not yet valid for booking. Please try again after the start date.");
      }
      if (offer.end_date && new Date(offer.end_date) < now) {
        await client.query('ROLLBACK');
        throw new AppError(400, "This deal has expired and is no longer available for booking.");
      }
      // When deal is active (already validated above), allow booking unless partner is explicitly suspended or rejected.
      const partnerStatus = offer.partner_status != null ? String(offer.partner_status).toLowerCase() : '';
      const partnerBlocked = ['suspended', 'rejected'].includes(partnerStatus);
      if (partnerBlocked) {
        await client.query('ROLLBACK');
        throw new AppError(400, "This partner is suspended or rejected. Booking is not available. Please select a different deal.");
      }

      partner_id = offer.partner_id;
      serviceType = (offer.service_type || '').toLowerCase();

      // Atomic redemption limit: reserve one slot only if under max (prevents race conditions)
      const updatedOffer = await offerRepository.incrementOfferRedemptionsAtomic(offer_id, client);
      if (!updatedOffer) {
        await client.query('ROLLBACK');
        throw new AppError(400, "Offer fully redeemed");
      }

      amount = parseFloat(offer.discounted_price || offer.original_price || 0);
      bookingPayload.deal_id = offer_id;  // Use deal_id to match table schema
      bookingPayload.offer_id = offer_id;  // Keep for backwards compatibility
      // INVENTORY model: events use temp_reserved with token locking + dynamic expiry
      // SERVICE model: all other service types use immediate confirmation
      const offerBookingCategory = getBookingCategoryFromServiceType(offer.service_type);
      const isEventType = offerBookingCategory === 'INVENTORY';
      if (isEventType) {
        bookingPayload.status = 'temp_reserved';
        bookingPayload.booking_category = 'INVENTORY';
        bookingPayload.platform_handles_payment = false;
      } else {
        bookingPayload.status = 'confirmed';
        bookingPayload.booking_category = 'SERVICE';
      }
      // Snapshot deal co-pay at booking time so redemption uses terms that applied when user booked.
      // Backward-compat: some deployments still have legacy discount_percentage.
      const rawCoPay = offer.co_pay_percentage != null ? offer.co_pay_percentage : offer.discount_percentage;
      const coPayPct = rawCoPay != null ? parseFloat(rawCoPay) : NaN;
      bookingPayload.co_pay_percentage_at_booking = Number.isFinite(coPayPct)
        ? normalizeCoPayPercentage(Math.min(100, Math.max(0, coPayPct)))
        : null;
    } else if (show_id) {
      // Show/Theatre booking
      if (!seat_template_ids || !Array.isArray(seat_template_ids) || seat_template_ids.length === 0) {
        await client.query('ROLLBACK');
        throw new AppError(400, "seat_template_ids array is required for show bookings");
      }

      const show = await theatreService.getShow(show_id);
      const seatMap = await theatreService.getShowSeatMap(show_id);

      // Verify all requested seats exist and are available
      const requestedSeats = seatMap.seats.filter(s => seat_template_ids.includes(s.seat_template_id));
      if (requestedSeats.length !== seat_template_ids.length) {
        await client.query('ROLLBACK');
        throw new AppError(404, "One or more seats not found");
      }

      const unavailableSeats = requestedSeats.filter(
        s => s.status !== 'available' && s.status !== 'reserved'
      );
      if (unavailableSeats.length > 0) {
        await client.query('ROLLBACK');
        const seatInfo = unavailableSeats.map(s => `${s.row}${s.number}`).join(', ');
        throw new AppError(409, `Seats ${seatInfo} are not available`);
      }

      // Calculate total amount from seat prices
      amount = requestedSeats.reduce((sum, seat) => sum + (parseFloat(seat.price) || 0), 0);

      // Get partner_id from theatre
      const theatreResult = await client.query(
        'SELECT partner_id FROM theatres WHERE id = (SELECT theatre_id FROM screens WHERE id = $1)',
        [show.screen_id]
      );
      partner_id = theatreResult.rows[0]?.partner_id || null;
      serviceType = 'shows';

      bookingPayload.show_id = show_id;
      bookingPayload.seat_template_ids = seat_template_ids;
      bookingPayload.status = 'confirmed';
      bookingPayload.num_tickets = seat_template_ids.length;
    }

    // Apply bank offer discount if provided (before EZT discount)
    let bankOfferDiscount = 0;
    if (bank_offer_id && bank_offer_rule_id) {
      try {
        const bankDiscountResult = await bankOfferService.calculateDiscount(bank_offer_rule_id, amount);
        if (bankDiscountResult.error) {
          await client.query('ROLLBACK');
          throw new AppError(400, bankDiscountResult.error);
        }
        bankOfferDiscount = bankDiscountResult.discount;
        log(`Bank offer discount calculated: ₹${bankOfferDiscount} on ₹${amount}`);
      } catch (bankError) {
        await client.query('ROLLBACK');
        throw new AppError(400, `Bank offer calculation failed: ${bankError.message}`);
      }
    }

    // Handle EZT token redemption if provided
    let eztRedeemed = 0;
    let eztDiscount = 0;
    let finalAmount = amount - bankOfferDiscount; // Apply bank discount first
    
    if (ezt_to_redeem && parseFloat(ezt_to_redeem) > 0) {
      try {
        if (bookingPayload.booking_category === 'INVENTORY') {
          // INVENTORY: LOCK tokens (do NOT deduct yet — deduction happens at redemption)
          // Store lock intent; actual lock INSERT happens after booking INSERT when booking.id is available
          const effectiveBalance = await tokenService.getEffectiveBalance(user_id, client);
          const lockableEzt = Math.min(parseFloat(ezt_to_redeem), Math.max(0, effectiveBalance));
          bookingPayload._eztToLock = parseFloat(ezt_to_redeem); // Will be capped at lockTokens()
          eztRedeemed = 0; // No actual deduction yet
          eztDiscount = Math.round(lockableEzt * 100 * 100) / 100; // Estimated discount for pricing display
          finalAmount = Math.max(0, finalAmount - eztDiscount);
        } else {
          // SERVICE: existing redeemTokens flow (unchanged)
          const bookingType = event_id ? 'event' : (offer_id ? 'offer' : 'show');
          // STABILIZATION FIX: Pass transaction client to redeemTokens to ensure
          // token balance check + deduction is atomic within the booking transaction.
          const redeemResult = await tokenService.redeemTokens(user_id, parseFloat(ezt_to_redeem), null, `Redeemed for ${bookingType} booking`, client);
          eztRedeemed = redeemResult.eztRedeemed;
          eztDiscount = redeemResult.discountAmount;
          // BUG FIX #6: Subtract from already discounted amount (finalAmount), not original amount
          finalAmount = Math.max(0, finalAmount - eztDiscount);
        }
      } catch (redeemError) {
        await client.query('ROLLBACK');
        throw new AppError(400, `EZT redemption failed: ${redeemError.message}`);
      }
    }

    const partner_earning = Math.round((finalAmount * (100 - commission_percentage)) / 100 * 100) / 100;

    // BUG FIX #5: Set booking_type explicitly in payload
    const bookingType = event_id ? 'event' : (offer_id ? 'offer' : 'show');

    // Generate voucher code (UUID v4, globally unique, immutable)
    // CRITICAL: Generate BEFORE any database operations to ensure consistency
    const voucherCode = uuidv4();
    if (!voucherCode) {
      await client.query('ROLLBACK');
      throw new AppError(500, "Failed to generate voucher code");
    }
    
    // Generate booking reference early (needed for QR code)
    const bookingReference = bookingRepository.generateBookingReference();
    if (!bookingReference) {
      await client.query('ROLLBACK');
      throw new AppError(500, "Failed to generate booking reference");
    }
    
    // Get human-readable information for QR code
    let dealTitle = null;
    let partnerName = null;
    let guestName = null;
    
    // Get user name (guest name)
    if (user_id) {
      try {
        const user = await userRepository.getUserById(user_id);
        if (user) {
          const firstName = user.first_name || '';
          const lastName = user.last_name || '';
          guestName = `${firstName} ${lastName}`.trim() || user.email || user.phone_number || 'Guest';
        }
      } catch (userError) {
        logError('⚠️ Could not fetch user name for QR code:', userError);
        // Continue without guest name
      }
    }
    
    // Get deal/event title — FIX #12: Reuse already-fetched offer instead of re-querying
    if (offer_id && offer) {
      dealTitle = offer.title || null;
    } else if (event_id) {
      const event = await eventRepository.getEventById(event_id);
      dealTitle = event?.title || null;
    }
    
    // Get partner name and timezone
    let partnerTZ = 'Asia/Kolkata'; // Default timezone
    if (partner_id) {
      try {
        const partner = await partnerRepository.getPartnerById(partner_id);
        partnerName = partner?.name || null;
        partnerTZ = partner?.timezone || 'Asia/Kolkata';
      } catch (partnerError) {
        logError('⚠️ Could not fetch partner name for QR code:', partnerError);
        // Continue without partner name, use default timezone
      }
    }
    
    // Extract booking date and time from multiple sources (priority order):
    // 1. Direct booking_date/booking_time (for events, passed from frontend)
    // 2. reservation_data.date/time (for dining)
    // 3. Current date/time (fallback — for storage only, NOT validated against hours)
    // CRITICAL: Check booking_date and booking_time FIRST (before bookingPayload which is empty initially)
    let bookingDate = booking_date || null;
    let bookingTime = booking_time || null;

    log(`🔍 Booking time extraction - Initial: booking_date=${booking_date}, booking_time=${booking_time}, reservation_data=${JSON.stringify(reservation_data)}`);

    if (reservation_data) {
      // Validate: if both direct params and reservation_data provide a date, they must match
      if (bookingDate && reservation_data.date && bookingDate !== reservation_data.date) {
        await client.query('ROLLBACK');
        throw new AppError(400, 'Booking date mismatch between request and reservation data.');
      }
      if (reservation_data.date) {
        bookingDate = reservation_data.date;
      }
      if (reservation_data.time) {
        bookingTime = reservation_data.time;
        log(`✅ Using time from reservation_data: ${bookingTime}`);
      }
    }

    // Determine if this booking type REQUIRES operating hours validation.
    // Time-based services (dining, events, shows) must be validated — they represent
    // a specific visit to the venue at a specific time.
    // Non-time-based services (spa vouchers, travel packages, wellness, etc.) are
    // voucher purchases — the user will visit the venue at their convenience later.
    const TIME_BASED_SERVICES = ['dining', 'events', 'shows'];
    const requiresHoursValidation = TIME_BASED_SERVICES.includes(serviceType);

    // Default date/time for STORAGE and validation.
    // Uses partner's timezone so defaults are correct regardless of server timezone.
    // For non-time-based services (spa, wellness, travel, others): user selects only date; time slot
    // is confirmed by contacting partner. Use "12:00" as neutral placeholder — do NOT use current time,
    // which would cause "Selected booking time has already passed" when user picks a past date.
    const isDateOnlyBooking = !requiresHoursValidation && booking_date && !booking_time;
    if (!bookingDate || !bookingTime) {
      if (serviceType === 'events' && eventStartTimeForDefault) {
        // For events with a known start_time, extract date/time in partner's timezone
        const evtDate = new Date(eventStartTimeForDefault);
        if (!Number.isNaN(evtDate.getTime())) {
          if (!bookingDate) bookingDate = evtDate.toLocaleDateString('en-CA', { timeZone: partnerTZ });
          if (!bookingTime) bookingTime = evtDate.toLocaleTimeString('en-GB', { timeZone: partnerTZ, hour12: false, hour: '2-digit', minute: '2-digit' });
        }
        log(`⚠️ No booking date/time provided, using event start for record/validation: ${bookingDate} ${bookingTime}`);
      } else if (isDateOnlyBooking) {
        // Non-time-based: user provided date only. Use 12:00 as placeholder for storage.
        if (!bookingTime) {
          bookingTime = '12:00';
          log(`📅 Date-only booking (contact partner for time): using 12:00 placeholder for ${bookingDate}`);
        }
      } else {
        const nowInPartnerTZ = getNowInTZ(partnerTZ);
        if (!bookingDate) {
          bookingDate = nowInPartnerTZ.date;
          log(`⚠️ No booking date provided, using current date in partner TZ (${partnerTZ}): ${bookingDate}`);
        }
        if (!bookingTime) {
          bookingTime = nowInPartnerTZ.time;
          log(`⚠️ No booking time provided, using current time in partner TZ (${partnerTZ}): ${bookingTime}`);
        }
      }
    }
    if (bookingTime) {
      log(`✅ Final booking time: ${bookingTime}`);
    }
    
    // CRITICAL: Validate partner_id before proceeding
    // Redemption requires partner_id - booking without partner_id cannot be redeemed
    if (!partner_id) {
      await client.query('ROLLBACK');
      throw new AppError(500, "Partner mapping failed for booking. Cannot create booking without partner_id.");
    }

    // EVENTS: If event_slots are defined, validate booking_time matches a slot.
    // If no event_slots exist, allow any time (validated later against operating hours, like dining).
    if (offer_id && serviceType === 'events' && requiresHoursValidation) {
      const eventSlots = await eventSlotsRepository.listByOffer(offer_id, client);
      const hasDefinedSlots = eventSlots && eventSlots.length > 0;

      if (hasDefinedSlots) {
        // Validate booking_time matches one of the defined event_slots
        const normTime = (t) => {
          const s = String(t || '').trim().substring(0, 5);
          if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
          const [h, m] = s.split(':').map(Number);
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };
        const bookingTimeNorm = normTime(bookingTime);
        const validSlots = eventSlots.map(s => normTime(s.slot_time)).filter(Boolean);
        if (!bookingTimeNorm || !validSlots.includes(bookingTimeNorm)) {
          await client.query('ROLLBACK');
          throw new AppError(400, "Selected time does not match any event slot. Please choose from the available slots.");
        }
      } else {
        // No event_slots defined — allow any time; operating hours validation below will handle it
        log(`ℹ️ Event ${offer_id} has no event_slots defined — allowing free time selection within operating hours`);
      }

      // EVENTS: Validate booking_date matches the event's date (applies regardless of whether slots are defined)
      // Source: experience_metadata.event_date, or offer start_date when start_date === end_date (single-day event)
      const eventDateRow = await client.query(
        `SELECT em.event_date, po.start_date, po.end_date
         FROM partner_offers po
         LEFT JOIN experience_metadata em ON em.offer_id = po.id
         WHERE po.id = $1`,
        [offer_id]
      );
      const row = eventDateRow.rows[0];
      const eventDateFromMeta = row?.event_date;
      const startDate = row?.start_date ?? offer?.start_date;
      const endDate = row?.end_date ?? offer?.end_date;
      const bookingDateStr = String(bookingDate || '').trim();

      const toDateStr = (d) => {
        if (!d) return null;
        if (typeof d === 'string') return d.split('T')[0].split(' ')[0];
        if (d instanceof Date) return d.toISOString().split('T')[0];
        return String(d).split('T')[0].split(' ')[0];
      };
      let eventDateStr = eventDateFromMeta ? toDateStr(eventDateFromMeta) : null;
      if (!eventDateStr && startDate && endDate) {
        const startStr = toDateStr(startDate);
        const endStr = toDateStr(endDate);
        if (startStr && endStr && startStr === endStr) {
          eventDateStr = startStr; // Single-day event: start_date === end_date
        }
      }
      if (eventDateStr && bookingDateStr && eventDateStr !== bookingDateStr) {
        await client.query('ROLLBACK');
        const formatted = eventDateStr.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${d}/${m}/${y}`);
        throw new AppError(400, `This event is only on ${formatted}. Please select that date to book.`, {
          reason: 'BOOKING_DATE_MISMATCH',
          event_date: eventDateStr
        });
      }
      if (!eventDateStr && startDate && endDate && bookingDateStr) {
        const startStr = toDateStr(startDate);
        const endStr = toDateStr(endDate);
        if (startStr && endStr && (bookingDateStr < startStr || bookingDateStr > endStr)) {
          await client.query('ROLLBACK');
          throw new AppError(400, `This event is scheduled between ${startStr} and ${endStr}. Please select a date within that range.`, {
            reason: 'BOOKING_DATE_OUT_OF_RANGE'
          });
        }
      }
    }

    // Fetch user's current tier at booking time (canonical: Ather, Nova, Luminar, Valiant, Echelon only)
    let userTierAtBooking = 'Ather';
    try {
      const tierResult = await client.query(
        `SELECT current_tier_name FROM users WHERE id = $1`,
        [user_id]
      );
      userTierAtBooking = normalizeTierName(tierResult.rows[0]?.current_tier_name);
    } catch (tierErr) {
      logError('⚠️ Could not fetch user tier for booking:', tierErr);
    }

    // ============================================
    // CRITICAL: PAST-BOOKING VALIDATION
    // ============================================
    // For time-based services (dining, events): validate date+time.
    // For non-time-based services (spa, wellness, travel, others): validate only date —
    // user will contact partner for time slot; any time is a placeholder.
    if (!requiresHoursValidation && bookingDate) {
      const dateCheck = bookingValidation.validateBookingDateNotInPast(bookingDate, partnerTZ);
      if (!dateCheck.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, dateCheck.message || 'Selected date has already passed.', {
          reason: dateCheck.reason || 'BOOKING_DATE_IN_PAST'
        });
      }
    } else if (bookingDate && bookingTime) {
      const pastCheck = bookingValidation.validateBookingNotInPast(bookingDate, bookingTime, partnerTZ);
      if (!pastCheck.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, pastCheck.message || 'Selected booking time has already passed.', {
          reason: pastCheck.reason || 'BOOKING_TIME_IN_PAST'
        });
      }
    }

    // ============================================
    // CRITICAL: OPERATING HOURS + ECHELON VALIDATION
    // ============================================
    // For time-based services (dining, events, shows): ALWAYS validate against
    // operating hours — default to current time if user didn't provide one.
    // For non-time-based services (spa, wellness, travel, etc.): skip this check
    // because the user is purchasing a voucher, not reserving a specific time slot.
    // Echelon tier can override CAPACITY, but NOT operating hours.

    if (requiresHoursValidation && partner_id) {
      log(`🔍 Validating booking time: ${bookingDate} ${bookingTime} for partner ${partner_id}`);

      // EVENT deals with event_slots: use getEffectiveEventSlotCapacity (event_slots.capacity).
      // EVENT deals WITHOUT event_slots: optional slots — use venue_time_slots / operating hours like dining.
      let effectiveEventSlotCapacity = null;
      const isEventOffer = serviceType === 'events';
      const eventSlotsForCapacity = await eventSlotsRepository.listByOffer(offer_id, client);
      const hasEventSlots = eventSlotsForCapacity && eventSlotsForCapacity.length > 0;

      if (isEventOffer && offer_id && hasEventSlots) {
        try {
          const eventCap = await slotCapacityService.getEffectiveEventSlotCapacity(offer_id, bookingDate, bookingTime, client);
          effectiveEventSlotCapacity = eventCap.capacity;
        } catch (err) {
          if (err.message === 'SLOT_NOT_FOUND') {
            await client.query('ROLLBACK');
            throw new AppError(400, 'Selected time does not match any event slot. Please choose from the available slots.', { reason: 'SLOT_NOT_FOUND' });
          }
          throw err;
        }
      }

      if (process.env.DEBUG_BOOKING_CAPACITY === 'true') {
        log(`[BOOKING DEBUG] createBooking: offer_id=${offer_id} booking_date=${bookingDate} booking_time=${bookingTime} normalized_timeSlot=${slotCapacityService.normalizeDealTimeSlot(bookingTime)} max_redemptions_per_slot=${offer?.max_redemptions_per_slot ?? 'null'} effective_event_slot_capacity=${effectiveEventSlotCapacity ?? 'null'} is_event=${isEventOffer} hasEventSlots=${hasEventSlots}`);
      }

      const validation = await bookingValidation.validateBookingRequest({
        partner_id,
        user_id,
        booking_date: bookingDate,
        booking_time: bookingTime,
        party_size: num_tickets || 1,
        user_tier: userTierAtBooking,
        timezone: partnerTZ,
        offer_id: offer_id || null,
        max_redemptions_per_slot: (isEventOffer && hasEventSlots) ? null : (offer?.max_redemptions_per_slot ?? null),
        is_event: isEventOffer && hasEventSlots,
        effective_event_slot_capacity: effectiveEventSlotCapacity
      });

      if (!validation.allowed) {
        await client.query('ROLLBACK');

        // Return different messages based on reason
        if (validation.reason === 'CAPACITY_FULL' && validation.can_waitlist) {
          throw new AppError(409, validation.message || 'Time slot fully booked. Join waitlist?', {
            can_waitlist: true,
            waitlist_info: validation.waitlist_info
          });
        }

        throw new AppError(400, validation.message || `Booking not allowed: ${validation.reason}`, {
          reason: validation.reason,
          can_waitlist: validation.can_waitlist || false
        });
      }

      if (validation.override_used) {
        bookingPayload.is_priority_override = true;
        bookingPayload.override_reason = validation.override_reason;
        log(`👑 Echelon override used for user ${user_id} at ${bookingDate} ${bookingTime}`);
      }

      // Concurrency-safe slot reserve: EVENT with slots uses effectiveEventSlotCapacity.
      // EVENT without slots / non-EVENT: use max_redemptions_per_slot or venue_time_slots.
      let slotReserved = false;
      const effectiveSlotCapacity = (isEventOffer && hasEventSlots) ? effectiveEventSlotCapacity : (offer?.max_redemptions_per_slot ?? null);

      if (effectiveSlotCapacity != null && effectiveSlotCapacity >= 1 && offer_id) {
        const reserveResult = await slotCapacityService.reserveDealSlot(
          client,
          offer_id,
          bookingDate,
          bookingTime,
          num_tickets || 1,
          effectiveSlotCapacity
        );
        if (reserveResult.status === 'CONFIRMED') {
          slotReserved = true;
          bookingPayload._dealSlotReserved = true;
        } else if (reserveResult.status === 'FULL') {
          await client.query('ROLLBACK');
          throw new AppError(409, 'Time slot just became full. Try again or join waitlist.', { can_waitlist: true });
        }
      } else {
        const slotDt = slotCapacityService.toSlotDatetime(bookingDate, bookingTime);
        if (slotDt) {
          const reserveResult = await slotCapacityService.reserveSlot(
            client,
            partner_id,
            slotDt,
            (String(userTierAtBooking || '').trim().toLowerCase() === 'echelon'),
            num_tickets || 1,
            slotCapacityService.DEFAULT_CAPACITY,
            slotCapacityService.DEFAULT_ECHELON_BUFFER
          );
          if (reserveResult.status === 'CONFIRMED') {
            slotReserved = true;
            if (reserveResult.is_priority_override) {
              bookingPayload.is_priority_override = true;
              bookingPayload.override_reason = bookingPayload.override_reason || 'Echelon tier capacity override';
            }
          } else if (reserveResult.status === 'FULL') {
            await client.query('ROLLBACK');
            throw new AppError(409, 'Time slot just became full. Try again or join waitlist.', { can_waitlist: true });
          }
        }
      }
      bookingPayload._slotReserved = slotReserved;
    } else if (partner_id) {
      log(`⏩ Skipping hours validation — service_type="${serviceType}" is not time-based. Stored date/time: ${bookingDate} ${bookingTime}`);
    }

    // Campaign evaluation inside transaction: get reward_multiplier for use at redemption
    if (offer_id) {
      try {
        const campaignEngine = require('../campaign/campaignService');
        const campaignContext = {
          userId: user_id,
          experienceId: offer_id,
          partnerId: partner_id,
          amount: finalAmount,
          userTier: userTierAtBooking,
        };
        const campaignResult = await campaignEngine.processEvent('booking_created', campaignContext);
        const multiplier = campaignResult?.campaign_effects?.reward_multiplier;
        if (multiplier != null) {
          bookingPayload.reward_multiplier = Math.max(0.1, Math.min(5, Number(multiplier)));
          log(`📊 Campaign reward_multiplier applied for booking: ${bookingPayload.reward_multiplier}`);
        }
      } catch (campaignErr) {
        logError('Campaign evaluation (non-fatal):', campaignErr);
        // Continue with default 1.0
      }
    }

    // Create booking FIRST (before QR generation)
    // QR generation requires booking.id - must happen after booking is created
    bookingPayload.amount = finalAmount;
    bookingPayload.fiat_amount = amount;  // Original amount before EZT discount
    bookingPayload.ezt_redeemed = eztRedeemed;
    bookingPayload.partner_id = partner_id;
    bookingPayload.reward_eligible = true;
    bookingPayload.booking_type = bookingType;  // BUG FIX #5: Store booking type
    bookingPayload.commission_percentage = commission_percentage;  // For transaction record
    bookingPayload.partner_earning = partner_earning;  // For transaction record
    bookingPayload.voucher_code = voucherCode;  // Set voucher code
    bookingPayload.booking_reference = bookingReference;  // Set booking reference
    bookingPayload.voucher_state = 'created';  // Initial state: CREATED
    bookingPayload.booking_date = bookingDate;  // Set booking date from reservation_data or current
    bookingPayload.booking_time = bookingTime;  // Set booking time from reservation_data or current
    bookingPayload.user_tier_at_booking = userTierAtBooking;  // Store user's tier at booking time
    bookingPayload.booking_mode = getBookingModeFromServiceType(serviceType);  // ONLINE_TIME_SLOT | PARTNER_CONFIRMATION
    if (booked_at_client) bookingPayload.booked_at_client = booked_at_client;  // Client timestamp for "Booked on" display

    // ═══════════════════════════════════════════════════════════════
    // INVENTORY: Max reservations check + dynamic expiry + pricing snapshot
    // ═══════════════════════════════════════════════════════════════
    if (bookingPayload.booking_category === 'INVENTORY') {
      // Abuse prevention: max simultaneous temp_reserved bookings per user
      await enforceMaxInventoryReservations(user_id, client);

      // Dynamic expiry calculation (replaces payment_deadline for INVENTORY)
      // Pass the event's REAL start_time (null for open-ended events like "All year round Cafe access")
      // so calculateInventoryExpiry can distinguish real event times from defaulted bookingTime values.
      const expiryResult = await calculateInventoryExpiry(bookingDate, bookingTime, partnerTZ, {
        eventStartTime: eventStartTimeForDefault || null
      });
      if (!expiryResult.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, expiryResult.message || 'Booking window has closed for this event.', {
          reason: expiryResult.reason || 'BOOKING_TOO_LATE'
        });
      }
      bookingPayload.reservation_expires_at = expiryResult.expiresAt;
      log(`⏰ Inventory reservation expiry set: ${expiryResult.expiresAt.toISOString()} (${expiryResult.description})`);

      // Full pricing snapshot frozen at booking time (for audit + dispute resolution)
      bookingPayload.pricing_snapshot = JSON.stringify({
        total_price: finalAmount,
        fiat_amount: amount,
        ezt_to_redeem: parseFloat(ezt_to_redeem || 0),
        ezt_discount_inr: eztDiscount,
        bank_offer_discount: bankOfferDiscount,
        co_pay_percentage: bookingPayload.co_pay_percentage_at_booking,
        user_tier: userTierAtBooking,
        ezt_rate_inr: 100,
        commission_percentage: commission_percentage,
        partner_earning: partner_earning,
        event_price_per_ticket: event_id ? (amount / (num_tickets || 1)) : null,
        num_tickets: num_tickets || 1,
        snapshot_at: new Date().toISOString()
      });
    }

    // EVENT PAYMENT DEADLINE: Calculate dynamic deadline for payment_pending bookings (SERVICE events / legacy)
    if (bookingPayload.status === 'payment_pending') {
      const deadlineOptions = {};
      // Waitlist promotions get a shorter acceptance window (default 30 min)
      if (bookingData.is_waitlist_promotion) {
        let acceptanceMinutes = 30;
        try {
          const acceptSetting = await settingsRepository.getSystemSetting('event_waitlist_acceptance_minutes');
          if (acceptSetting) acceptanceMinutes = parseInt(acceptSetting, 10) || 30;
        } catch (_) {}
        deadlineOptions.overrideWindowMinutes = acceptanceMinutes;
      }
      const deadlineResult = await calculatePaymentDeadline(bookingDate, bookingTime, partnerTZ, deadlineOptions);
      if (!deadlineResult.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, deadlineResult.message || 'Booking window has closed for this event.', {
          reason: deadlineResult.reason || 'PAYMENT_WINDOW_CLOSED'
        });
      }
      bookingPayload.payment_deadline = deadlineResult.deadline;
      log(`⏰ Event payment deadline set: ${deadlineResult.deadline.toISOString()} (${deadlineResult.description})`);
    }

    // Voucher "Valid until" = universal: 30 days from booked/visit date (or from today if no date) OR deal end, whichever is earlier.
    // All date parsing uses partner's timezone so expiry is correct regardless of server timezone.
    if (offer_id) {
      const fromDate = bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate).trim())
        ? parseDateInTZ(String(bookingDate).trim(), partnerTZ, 12) || new Date()
        : new Date();
      const thirtyDaysFromVisit = new Date(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      // FIX #12: Reuse already-fetched offer instead of re-querying
      if (offer && offer.end_date) {
        const offerEnd = new Date(offer.end_date);
        bookingPayload.expires_at = offerEnd < thirtyDaysFromVisit ? offerEnd : thirtyDaysFromVisit;
      } else {
        bookingPayload.expires_at = thirtyDaysFromVisit;
      }
    } else if (event_id) {
      // Events: expire voucher 24 hours after the event date (in partner's timezone)
      const eventExpiry = bookingDate
        ? new Date((parseDateInTZ(bookingDate, partnerTZ, 0) || new Date()).getTime() + 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      bookingPayload.expires_at = eventExpiry;
    } else if (show_id) {
      // Shows: expire voucher 24 hours after the show date (in partner's timezone)
      const showExpiry = bookingDate
        ? new Date((parseDateInTZ(bookingDate, partnerTZ, 0) || new Date()).getTime() + 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      bookingPayload.expires_at = showExpiry;
    } else {
      bookingPayload.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // NOTE: qr_code_url will be set AFTER booking creation and QR generation
    
    // Create booking FIRST (before QR generation)
    const booking = await bookingRepository.createBooking(bookingPayload, client);
    
    // CRITICAL: Generate QR code AFTER booking is created (P0 Fix #1)
    // QR generation requires booking.id - must happen after booking exists
    // QR generation failure MUST fail the booking (P0 Fix #2)
    let qrCodeUrl = null;
    try {
      const qrMetadata = {
        booking_reference: booking.booking_reference,
        guest_name: guestName,
        deal_title: dealTitle,
        partner_name: partnerName,
        num_guests: booking.num_guests || booking.num_tickets || 1,
        booking_date: booking.booking_date || bookingDate,
        booking_time: booking.booking_time || bookingTime,
        booking_id: booking.id, // CRITICAL: booking.id is now available
        booking_type: bookingType,
        partner_id: partner_id,
        user_id: user_id,
        created_at: booking.created_at || new Date().toISOString(),
        // Enterprise fields for complete voucher details
        user_tier: userTierAtBooking,
        total_amount: finalAmount,
        original_amount: amount,
        ezt_redeemed: eztRedeemed,
        voucher_state: booking.voucher_state || 'active',
        expires_at: booking.expires_at || bookingPayload.expires_at || null
      };
      qrCodeUrl = await generateAndUploadQRCode(voucherCode, qrMetadata);
      log(`✅ QR code generated and uploaded for booking ${booking.id}: ${qrCodeUrl}`);
      
      // Update booking with QR code URL (within transaction)
      await client.query(
        `UPDATE bookings SET qr_code_url = $1 WHERE id = $2`,
        [qrCodeUrl, booking.id]
      );
      booking.qr_code_url = qrCodeUrl;
    } catch (qrError) {
      // CRITICAL: QR generation failure MUST rollback booking (P0 Fix #2)
      // No QR = no booking (enterprise rule)
      await client.query('ROLLBACK');
      logError('❌ QR code generation failed - rolling back booking:', {
        error: qrError.message,
        bookingId: booking.id,
        voucherCode: voucherCode,
        bookingReference: bookingReference
      });
      throw new AppError(500, `Booking creation failed: QR code generation error - ${qrError.message}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // INVENTORY: Create token lock now that booking.id is available
    // ═══════════════════════════════════════════════════════════════
    if (bookingPayload.booking_category === 'INVENTORY' && bookingPayload._eztToLock > 0) {
      try {
        const lockResult = await tokenService.lockTokens(
          user_id, bookingPayload._eztToLock, booking.id,
          bookingPayload.reservation_expires_at, client
        );
        // Update booking with locked amounts (SAVEPOINT for migration safety)
        await client.query('SAVEPOINT ezt_lock_update');
        try {
          await client.query(
            `UPDATE bookings SET ezt_locked = $1, ezt_locked_inr = $2 WHERE id = $3`,
            [lockResult.locked, lockResult.lockedInr, booking.id]
          );
          booking.ezt_locked = lockResult.locked;
          booking.ezt_locked_inr = lockResult.lockedInr;
          await client.query('RELEASE SAVEPOINT ezt_lock_update');
        } catch (_savepointErr) {
          await client.query('ROLLBACK TO SAVEPOINT ezt_lock_update');
          log(`⚠️ Could not update ezt_locked columns (migration may be needed), lock still created`);
        }
        log(`🔒 Token lock created for booking ${booking.id}: ${lockResult.locked} EZT (₹${lockResult.lockedInr})`);
      } catch (lockError) {
        await client.query('ROLLBACK');
        throw new AppError(400, `Token lock failed: ${lockError.message}`);
      }
    }

    // Transition state: CREATED → BOOKED → ACTIVE (if confirmed) or CREATED → BOOKED (if pending/temp_reserved)
    // CRITICAL: State machine requires: created → booked → active (cannot skip 'booked')
    // CRITICAL: State transition failure MUST rollback booking (P0 Fix #4)
    // Voucher state is required for redemption - invalid state = invalid booking
    try {
      const voucherStateMachine = require('./voucherStateMachine');
      
      // Step 1: Always transition created → booked first
      await voucherStateMachine.transitionState({
        bookingId: booking.id,
        voucherCode: voucherCode,
        fromState: 'created',
        toState: 'booked',
        actorId: user_id,
        actorRole: 'user',
        reasonCode: 'booking_created',
        reasonText: 'Booking created',
        executor: client
      });
      log(`✅ Voucher state transitioned: created → booked`);
      
      // Step 2: If booking is confirmed, transition booked → active
      // CRITICAL: This is a system-level transition (not user-initiated)
      // The booking is confirmed, so the voucher becomes active automatically
      if (bookingPayload.status === 'confirmed') {
        await voucherStateMachine.transitionState({
          bookingId: booking.id,
          voucherCode: voucherCode,
          fromState: 'booked',
          toState: 'active',
          actorId: user_id,
          actorRole: 'system', // System-initiated transition (booking confirmed)
          reasonCode: 'booking_confirmed',
          reasonText: 'Booking confirmed and activated',
          executor: client
        });
        log(`✅ Voucher state transitioned: booked → active`);
      }
    } catch (stateError) {
      // CRITICAL: State transition failure MUST rollback booking
      await client.query('ROLLBACK');
      logError('❌ Voucher state transition failed - rolling back booking:', {
        error: stateError.message,
        bookingId: booking.id,
        voucherCode: voucherCode,
        fromState: 'created',
        targetState: bookingPayload.status === 'confirmed' ? 'active' : 'booked'
      });
      throw new AppError(500, `Booking creation failed: Voucher state transition error - ${stateError.message}`);
    }

    // Confirm seat booking if this is a show booking
    if (show_id && bookingPayload.seat_template_ids) {
      try {
        await theatreService.confirmSeatBooking(show_id, bookingPayload.seat_template_ids, booking.id);
      } catch (seatError) {
        await client.query('ROLLBACK');
        logError('Failed to confirm seat booking:', seatError);
        throw new AppError(500, `Booking created but seat confirmation failed: ${seatError.message}`);
      }
    }
    
    // Get user's current tier for transaction record
    const userTierId = await userRepository.getUserTierId(user_id);
    
    // Get category_id from partner
    const categoryId = await partnerRepository.getPartnerCategoryId(partner_id);
    
    // Create transaction record
    const totalDiscount = bankOfferDiscount + eztDiscount;
    const transaction = await transactionRepository.createTransaction({
      user_id,
      partner_id,
      category_id: categoryId,
      bill_amount: amount,
      discount_percentage: totalDiscount > 0 ? (totalDiscount / amount * 100) : 0,
      discount_amount: totalDiscount,
      amount_after_discount: finalAmount,
      tokens_redeemed: eztRedeemed,
      tokens_earned: 0, // Will be calculated after commit
      user_tier_at_transaction: userTierId,
      payment_status: 'completed',
      transaction_type: 'purchase'
    }, client);  // BUG FIX #2: Pass client for transaction atomicity

    // Offer redemption count already incremented atomically above (incrementOfferRedemptionsAtomic)

    // Create table reservation if provided (for dining offers)
    let reservation = null;
    if (reservation_data && offer_id && partner_id) {
      try {
        // FIX #12: Reuse already-fetched offer instead of re-querying
        if (offer && (offer.service_type === 'dining' || offer.service_type === 'restaurant')) {
          reservation = await reservationService.createReservation({
            booking_id: booking.id,
            partner_id: partner_id,
            user_id: user_id,
            reservation_date: reservation_data.date,
            reservation_time: reservation_data.time,
            party_size: reservation_data.partySize || num_tickets,
            occasion: reservation_data.occasion,
            special_requests: reservation_data.specialRequests || special_requests,
            seating_preference: reservation_data.seatingPreference,
            skipCapacityUpdate: Boolean(bookingPayload._slotReserved)
          }, client);
          log(`Table reservation created for booking ${booking.id}`);
        }
      } catch (reservationError) {
        await client.query('ROLLBACK');
        logError('Failed to create reservation:', reservationError);
        throw new AppError(400, `Reservation creation failed: ${reservationError.message}`);
      }
    }

    // Create pre-order if provided (Echelon tier only)
    let preOrder = null;
    if (pre_order_data && offer_id && partner_id) {
      try {
        const canPreOrder = await preOrderService.canPreOrder(user_id);
        if (canPreOrder) {
          preOrder = await preOrderService.createPreOrder({
            booking_id: booking.id,
            reservation_id: reservation ? reservation.id : null,
            partner_id: partner_id,
            user_id: user_id,
            items: pre_order_data.items,
            total_amount: pre_order_data.totalAmount,
            special_instructions: pre_order_data.specialInstructions,
            dietary_requirements: pre_order_data.dietaryRequirements
          }, client);
          log(`Pre-order created for Echelon user ${user_id}, booking ${booking.id}`);
        } else {
          log(`Pre-order requested but user ${user_id} is not Echelon tier - skipping`);
        }
      } catch (preOrderError) {
        await client.query('ROLLBACK');
        logError('Failed to create pre-order:', preOrderError);
        throw new AppError(400, `Pre-order creation failed: ${preOrderError.message}`);
      }
    }

    // Update bank offer usage record with booking ID
    if (bank_offer_id && bank_offer_rule_id && bankOfferDiscount > 0) {
      try {
        await bankOfferService.applyBankOffer(
          booking.id,
          bank_offer_id,
          bank_offer_rule_id,
          user_id,
          amount,
          client
        );
      } catch (bankError) {
        // Log but don't fail - discount already applied
        logError('Failed to record bank offer usage:', bankError);
      }
    }

    // ====================================================================
    // ARCHITECTURAL FIX: Tier & Loyalty Processing Moved to Redemption
    // ====================================================================
    // 
    // In voucher-based systems (Nearbuy/EazyDiner model), tier and loyalty
    // processing must occur ONLY after redemption, when the actual bill amount
    // is known. Processing at booking time is incorrect because:
    // 1. Actual bill amount is unknown at booking (only estimated/discounted amount)
    // 2. Tier upgrades should be based on actual spending, not estimates
    // 3. Financial accuracy requires real transaction values
    //
    // Tier and loyalty processing will now happen in enhancedRedemptionService.js
    // when the partner redeems the voucher and enters the actual bill amount.
    //
    // Mark booking as tier_pending (implicitly - no tier processing done)
    log(`📋 Booking ${booking.id} created. Tier/loyalty processing deferred until redemption.`);
    
    // Initialize variables for response (tier processing deferred until redemption)
    const eztEarned = 0;
    const pointsEarned = 0;
    const tierResult = null;

    // BUG FIX #4: Enrich booking response with deal/offer title (BEFORE commit, inside try)
    // Note: dealTitle is already fetched earlier for QR code generation, reuse it
    // If not set earlier, fetch it now
    // FIX #12: Reuse already-fetched offer instead of re-querying
    if (!dealTitle) {
      if (offer_id && offer) {
        dealTitle = offer.title || null;
      } else if (event_id) {
        const event = await eventRepository.getEventById(event_id);
        dealTitle = event?.title || null;
      }
    }

    // Add additional info to booking response
    if (reservation) {
      booking.reservation = reservation;
    }
    if (preOrder) {
      booking.pre_order = preOrder;
    }
    if (bankOfferDiscount > 0) {
      booking.bank_offer_discount = bankOfferDiscount;
    }
    if (dealTitle) {
      booking.deal_title = dealTitle;
    }
    if (serviceType) {
      booking.service_type = serviceType;
    }
    if (bookingPayload.booking_mode) {
      booking.booking_mode = bookingPayload.booking_mode;
    }

    // Get user's current balances and tier info for rewards response
    const userResult = await client.query(
      `SELECT 
        u.available_tokens,
        u.current_tier_name,
        u.annual_spend_current,
        t.ezt_reward_percentage
      FROM users u
      LEFT JOIN loyalty_tiers t ON u.current_tier_name = t.tier_name
      WHERE u.id = $1`,
      [user_id]
    );
    const user = userResult.rows[0] || {};
    
    // Get current loyalty balance
    const loyaltyBalanceResult = await client.query(
      `SELECT balance_after 
       FROM loyalty_activity 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [user_id]
    );
    const currentLoyaltyBalance = parseFloat(loyaltyBalanceResult.rows[0]?.balance_after || 0);

    // Add rewards data to booking response
    booking.rewards = {
      ezt_earned: parseFloat(eztEarned || 0),
      loyalty_points_earned: parseFloat(pointsEarned || 0),
      tier: tierResult?.tierAtBooking || user.current_tier_name || 'Ather',
      earn_rate: parseFloat(tierResult?.rewardPercentage || user.ezt_reward_percentage || 1) / 100,
      tier_upgraded: tierResult?.tierUpgrade || null
    };
    
    // Add user balances for UI update
    booking.user_balances = {
      ezt_balance: parseFloat(user.available_tokens || 0),
      loyalty_points: currentLoyaltyBalance,
      current_tier: user.current_tier_name || 'Ather',
      annual_spend: parseFloat(user.annual_spend_current || 0)
    };

    // BUG FIX #3: COMMIT only after ALL processing succeeds
    await client.query('COMMIT');

    const bookingEventPayload = {
      action: 'created',
      bookingId: booking.id,
      bookingReference: booking.booking_reference,
      status: booking.status,
      bookingType,
      userId: user_id,
      partnerId: partner_id,
      amount: booking.amount,
      fiatAmount: booking.fiat_amount,
      eztRedeemed,
      eztEarned,
      pointsEarned,
      dealTitle,
      reservationId: reservation?.id || null,
      preOrderId: preOrder?.id || null,
      createdAt: booking.created_at || booking.createdAt || new Date().toISOString(),
      timestamp: new Date().toISOString()
    };

    emitRealtimeEvent(REALTIME_EVENTS.BOOKING_CREATED, bookingEventPayload);
    emitRealtimeEvent(REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, {
      ...bookingEventPayload,
      event: 'created'
    });
    emitToRoom(`partners:${partner_id}`, REALTIME_EVENTS.PARTNER_BOOKING_UPDATE, {
      ...bookingEventPayload,
      event: 'created'
    });
    emitToRoom(`users:${user_id}`, REALTIME_EVENTS.BOOKING_CREATED, bookingEventPayload);

    // Booking confirmation notifications (after commit; failure must not rollback booking)
    try {
      const notificationService = require('./notificationService');
      const isPaymentPending = booking.status === 'payment_pending';
      const notifTitle = isPaymentPending ? 'Booking Reserved — Payment Required' : 'Booking confirmed';
      const notifMessage = isPaymentPending
        ? `Your booking for ${dealTitle || 'your event'} is reserved. Please pay the venue directly before ${booking.payment_deadline ? new Date(booking.payment_deadline).toLocaleString('en-IN', { timeZone: partnerTZ }) : 'the deadline'}. Ref: ${booking.booking_reference}.`
        : `Your booking for ${dealTitle || 'your deal'} is confirmed. Voucher: ${booking.voucher_code || booking.booking_reference}.`;
      await notificationService.create({
        userId: user_id,
        type: isPaymentPending ? 'event_payment_pending' : 'booking_created',
        title: notifTitle,
        message: notifMessage,
        actionUrl: `/bookings/${booking.id}`,
        priority: 'high',
        metadata: { booking_id: booking.id, offer_name: dealTitle, booking_date: bookingDate, voucher_code: booking.voucher_code, payment_deadline: booking.payment_deadline || null },
        sentViaInApp: true,
        sentViaPush: true,
      });
      if (partner_id) {
        const partner = await partnerRepository.getPartnerById(partner_id);
        const partnerUserId = partner?.user_id || partner?.owner_user_id;
        if (partnerUserId) {
          const partnerNotifTitle = isPaymentPending ? 'New event booking — awaiting payment' : 'New booking';
          const partnerNotifMsg = isPaymentPending
            ? `New event booking for ${dealTitle || 'event'}. Ref: ${booking.booking_reference}. Awaiting payment — confirm when received.`
            : `New booking for ${dealTitle || 'deal'}. Ref: ${booking.booking_reference}. Voucher: ${booking.voucher_code || '—'}.`;
          await notificationService.create({
            userId: partnerUserId,
            type: isPaymentPending ? 'event_payment_pending_partner' : 'booking_received',
            title: partnerNotifTitle,
            message: partnerNotifMsg,
            actionUrl: `/partner/bookings`,
            priority: 'high',
            metadata: { booking_id: booking.id, offer_name: dealTitle, booking_date: bookingDate, voucher_code: booking.voucher_code, payment_deadline: booking.payment_deadline || null },
            sentViaInApp: true,
            sentViaPush: true,
          });
        }
      }
    } catch (notifErr) {
      logError('Booking notification failed (booking already committed):', notifErr);
    }

    return booking;
  } catch (err) {
    // Release slot capacity if it was reserved in this transaction
    // Use bookingPayload when available; avoid num_tickets (may be undefined if error occurred before destructuring)
    const partySize = (typeof bookingPayload !== 'undefined' && bookingPayload ? (bookingPayload.num_guests ?? bookingPayload.num_tickets ?? 1) : 1) || 1;
    if (typeof bookingPayload !== 'undefined' && bookingPayload && bookingPayload._slotReserved) {
      if (bookingPayload._dealSlotReserved && offer_id && bookingDate && bookingTime) {
        await slotCapacityService.releaseDealSlotStandalone(offer_id, bookingDate, bookingTime, partySize).catch((e) => {
          logError('Release deal slot on rollback failed:', e);
        });
      } else if (partner_id && bookingDate && bookingTime) {
        const slotDt = slotCapacityService.toSlotDatetime(bookingDate, bookingTime);
        if (slotDt) {
          await slotCapacityService.releaseSlotStandalone(partner_id, slotDt, partySize).catch((e) => {
            logError('Release slot on rollback failed (slot count may be stale):', e);
          });
        }
      }
    }
    await client.query('ROLLBACK');
    if (err.message === 'CAPACITY_SYSTEM_NOT_INITIALIZED') {
      throw new AppError(503, 'Capacity system is temporarily unavailable. Please try again later.', { reason: 'CAPACITY_SYSTEM_NOT_INITIALIZED' });
    }
    throw err;
  } finally {
    client.release();
  }
}

// List bookings with filters
async function listBookings(filters) {
  return await bookingRepository.listBookings(filters);
}

// Get booking by ID
async function getBookingById(bookingId) {
  const booking = await bookingRepository.getBookingById(bookingId);
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  return booking;
}

// Reschedule booking
// FIX #1: Release old slot capacity, validate new slot, reserve new slot capacity
async function rescheduleBooking(bookingId, userId, { booking_date, booking_time }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify booking exists and belongs to user
    const bookingResult = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [bookingId, userId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found or you do not have permission to reschedule it');
    }

    const booking = bookingResult.rows[0];

    // Check if booking can be rescheduled (not already redeemed, cancelled, or completed)
    // Past-date bookings that are still confirmed/pending CAN be rescheduled to today or a future date
    if (['redeemed', 'cancelled', 'completed'].includes(booking.status)) {
      await client.query('ROLLBACK');
      throw new AppError(400, `Cannot reschedule a booking with status: ${booking.status}`);
    }

    // Validate new datetime is not in the past (date + time, not just date)
    const timeToUpdate = booking_time || booking.booking_time || null;
    const timeToCheck = timeToUpdate || '00:00';
    if (booking_date && timeToCheck) {
      const pastCheck = bookingValidation.validateBookingNotInPast(booking_date, timeToCheck);
      if (!pastCheck.allowed) {
        await client.query('ROLLBACK');
        throw new AppError(400, pastCheck.message || 'Cannot reschedule to a past time.');
      }
    } else if (booking_date) {
      const newDate = new Date(booking_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDate < today) {
        await client.query('ROLLBACK');
        throw new AppError(400, 'Cannot reschedule to a past date');
      }
    }

    // FIX #1: Determine if this is a time-based booking that needs slot management
    const serviceType = (booking.service_type || booking.booking_mode || '').toLowerCase();
    const TIME_BASED_SERVICES = ['dining', 'events', 'shows'];
    const bookingMode = booking.booking_mode || getBookingModeFromServiceType(serviceType);
    const isTimeBased = TIME_BASED_SERVICES.includes(serviceType) ||
                        bookingMode === 'ONLINE_TIME_SLOT';
    const partySize = booking.num_tickets || booking.num_guests || 1;
    const dealId = booking.deal_id || booking.offer_id || null;
    const partnerId = booking.partner_id;
    const oldDate = booking.booking_date;
    const oldTime = booking.booking_time;

    if (isTimeBased && partnerId) {
      // --- Release old slot capacity ---
      if (dealId && oldDate) {
        try {
          await slotCapacityService.releaseDealSlot(client, dealId, oldDate, oldTime, partySize);
          log(`🔄 Released old deal slot: deal=${dealId} date=${oldDate} time=${oldTime}`);
        } catch (e) {
          logError(`⚠️ Failed to release old deal slot during reschedule:`, e);
        }
      }
      if (oldDate && oldTime) {
        const oldSlotDt = slotCapacityService.toSlotDatetime(oldDate, oldTime);
        if (oldSlotDt) {
          try {
            await slotCapacityService.releaseSlot(client, partnerId, oldSlotDt, partySize);
            log(`🔄 Released old venue slot: partner=${partnerId} slot=${oldSlotDt}`);
          } catch (e) {
            logError(`⚠️ Failed to release old venue slot during reschedule:`, e);
          }
        }
      }

      // --- Validate new time for events (must match defined event slot) ---
      if (serviceType === 'events' && dealId && timeToUpdate) {
        const eventSlots = await eventSlotsRepository.listByOffer(dealId, client);
        if (eventSlots && eventSlots.length > 0) {
          const normTime = (t) => {
            const s = String(t || '').trim().substring(0, 5);
            if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
            const [h, m] = s.split(':').map(Number);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          };
          const bookingTimeNorm = normTime(timeToUpdate);
          const validSlots = eventSlots.map(s => normTime(s.slot_time)).filter(Boolean);
          if (!bookingTimeNorm || !validSlots.includes(bookingTimeNorm)) {
            await client.query('ROLLBACK');
            throw new AppError(400, 'Selected time does not match any event slot. Please choose from the available slots.');
          }
        }
      }

      // --- Reserve new slot capacity ---
      if (dealId && booking_date) {
        let reserveCapacity = null;
        if (serviceType === 'events') {
          try {
            const eventCap = await slotCapacityService.getEffectiveEventSlotCapacity(dealId, booking_date, timeToUpdate, client);
            reserveCapacity = eventCap.capacity;
          } catch (_) { /* SLOT_NOT_FOUND — fall through */ }
        }
        if (reserveCapacity == null || reserveCapacity < 1) {
          try {
            const offerRes = await client.query(
              `SELECT max_redemptions_per_slot FROM partner_offers WHERE id = $1`,
              [dealId]
            );
            reserveCapacity = offerRes.rows[0]?.max_redemptions_per_slot ?? null;
          } catch (_) { /* use null */ }
        }
        if (reserveCapacity != null && reserveCapacity >= 1) {
          const reserveResult = await slotCapacityService.reserveDealSlot(
            client, dealId, booking_date, timeToUpdate, partySize, reserveCapacity
          );
          if (reserveResult.status === 'FULL') {
            await client.query('ROLLBACK');
            throw new AppError(409, 'New time slot is fully booked. Please choose a different time.', { can_waitlist: true });
          }
        }
      }
      // Reserve venue slot
      if (booking_date && timeToUpdate) {
        const newSlotDt = slotCapacityService.toSlotDatetime(booking_date, timeToUpdate);
        if (newSlotDt) {
          const reserveResult = await slotCapacityService.reserveSlot(
            client, partnerId, newSlotDt, false, partySize,
            slotCapacityService.DEFAULT_CAPACITY, slotCapacityService.DEFAULT_ECHELON_BUFFER
          );
          if (reserveResult.status === 'FULL') {
            await client.query('ROLLBACK');
            throw new AppError(409, 'New time slot is fully booked at the venue. Please choose a different time.', { can_waitlist: true });
          }
        }
      }
    }

    // Update booking date and time
    const updateResult = await client.query(
      `UPDATE bookings
       SET booking_date = $1,
           booking_time = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [booking_date, timeToUpdate, bookingId]
    );

    await client.query('COMMIT');

    log(`✅ Booking ${bookingId} rescheduled to ${booking_date} ${booking_time || ''}`);

    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    if (error.message === 'CAPACITY_SYSTEM_NOT_INITIALIZED') {
      throw new AppError(503, 'Capacity system is temporarily unavailable. Please try again later.', { reason: 'CAPACITY_SYSTEM_NOT_INITIALIZED' });
    }
    logError('❌ Reschedule booking error:', error);
    throw new AppError(500, `Failed to reschedule booking: ${error.message}`);
  } finally {
    client.release();
  }
}

// User cancels their own booking
async function cancelBooking(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);
    if (!booking) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found');
    }

    if (String(booking.user_id) !== String(userId)) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'You can only cancel your own bookings');
    }

    const cancellableStatuses = ['pending', 'payment_pending', 'temp_reserved', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      await client.query('ROLLBACK');
      throw new AppError(400, `Cannot cancel a booking with status "${booking.status}"`);
    }

    const resolvedId = booking.id;
    const updated = await bookingRepository.updateBookingStatus(resolvedId, 'cancelled', {
      cancelled_at: new Date(),
      cancellation_reason: 'Cancelled by user',
      cancelled_by: 'user'
    }, client);

    // Voucher state transition for payment_pending or confirmed cancellation
    try {
      const voucherStateMachine = require('./voucherStateMachine');
      const currentVoucherState = (booking.status === 'payment_pending' || booking.status === 'temp_reserved') ? 'booked' : 'active';
      await voucherStateMachine.transitionState({
        bookingId: resolvedId,
        voucherCode: booking.voucher_code,
        fromState: currentVoucherState,
        toState: 'cancelled',
        actorId: userId,
        actorRole: 'user',
        reasonCode: 'user_cancelled',
        reasonText: 'Cancelled by user',
        executor: client
      });
    } catch (vErr) {
      logError('⚠️ Voucher state transition on cancel failed (non-fatal):', vErr);
    }

    // INVENTORY: Release token lock on user cancellation
    if (booking.status === 'temp_reserved') {
      try {
        await tokenService.releaseTokenLock(resolvedId, 'user_cancel', client);
        log(`🔓 Token lock released for user-cancelled INVENTORY booking ${bookingId}`);
      } catch (lockErr) {
        logError(`⚠️ Failed to release token lock for booking ${bookingId}:`, lockErr);
      }
    }

    // Audit: user-initiated cancellation (within same transaction)
    await writeAuditWithExecutor(client, userId, 'user', 'booking_cancelled', 'booking', resolvedId, {
      previous_status: booking.status,
      new_status: 'cancelled',
      cancellation_reason: 'Cancelled by user',
      cancelled_by: 'user',
      booking_reference: booking.booking_reference,
      partner_id: booking.partner_id,
      deal_id: booking.deal_id,
      booking_date: booking.booking_date,
      booking_time: String(booking.booking_time || '').slice(0, 5),
    });

    const partySize = booking.num_tickets || booking.num_guests || 1;

    if (booking.deal_id && booking.booking_date) {
      try {
        await slotCapacityService.releaseDealSlot(client, booking.deal_id, booking.booking_date, booking.booking_time, partySize);
        log(`✅ Released deal slot for user-cancelled booking ${bookingId}`);
      } catch (slotErr) {
        logError(`⚠️ Failed to release deal slot for booking ${bookingId}:`, slotErr);
      }
    }
    if (booking.partner_id && booking.booking_date && booking.booking_time) {
      try {
        const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
        if (slotDt) {
          await slotCapacityService.releaseSlot(client, booking.partner_id, slotDt, partySize);
          log(`✅ Released venue slot for user-cancelled booking ${bookingId}`);
        }
      } catch (slotErr) {
        logError(`⚠️ Failed to release venue slot for booking ${bookingId}:`, slotErr);
      }
    }

    await client.query('COMMIT');

    // FIFO: Auto-promote next waitlist user to confirmed booking when slot opens
    if (booking.partner_id && booking.booking_date && booking.booking_time) {
      const dateStr = slotCapacityService.toDateString ? slotCapacityService.toDateString(booking.booking_date) : String(booking.booking_date).trim().substring(0, 10);
      const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
      if (dateStr && timeStr) {
        const promote = booking.deal_id
          ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
          : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
        promote
          .then((result) => {
            if (result) {
              if (result.booking) log(`🔔 FIFO waitlist: promoted user ${result.waitlistEntry?.user_id} to confirmed booking for slot ${dateStr} ${timeStr}`);
              else log(`🔔 FIFO waitlist: notified user ${result.user_id} for user-cancelled slot ${dateStr} ${timeStr}`);
            }
          })
          .catch((err) => logError('⚠️ Waitlist promote/notify failed (non-fatal):', err));
      }
    }

    return updated || { ...booking, status: 'cancelled' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Confirm payment for booking
async function confirmPayment(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId, client);
    if (!booking) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found');
    }

    if (String(booking.user_id) !== String(userId)) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'Not authorized to confirm payment for this booking');
    }

    if (!booking.reward_eligible) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Booking is not eligible for reward');
    }

    if (booking.reward_credited) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Reward already credited for this booking');
    }

    // Update booking to mark reward as credited
    await bookingRepository.updateBookingStatus(bookingId, booking.status, {
      reward_credited: true
    });

    await client.query('COMMIT');
    return booking;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Calculate dynamic payment deadline for event bookings.
 * Formula: MIN(now + paymentWindow, eventStart - safetyBuffer)
 * @param {string} bookingDate - YYYY-MM-DD
 * @param {string} bookingTime - HH:MM
 * @param {string} partnerTZ - IANA timezone (e.g. 'Asia/Kolkata')
 * @param {object} options - { overrideWindowMinutes } for waitlist promotions
 * @returns {{ deadline: Date, allowed: boolean, reason?: string, message?: string, description: string }}
 */
async function calculatePaymentDeadline(bookingDate, bookingTime, partnerTZ = 'Asia/Kolkata', options = {}) {
  // Fetch configurable values from system_settings
  let paymentWindowHours = 12;
  let safetyBufferHours = 2;

  try {
    const windowSetting = await settingsRepository.getSystemSetting('event_payment_window_hours');
    if (windowSetting) paymentWindowHours = parseFloat(windowSetting) || 12;
    const bufferSetting = await settingsRepository.getSystemSetting('event_safety_buffer_hours');
    if (bufferSetting) safetyBufferHours = parseFloat(bufferSetting) || 2;
  } catch (_) {
    // Use defaults if settings unavailable
  }

  // Override for waitlist promotions (shorter acceptance window)
  if (options.overrideWindowMinutes) {
    paymentWindowHours = options.overrideWindowMinutes / 60;
  }

  const now = new Date();
  const windowDeadline = new Date(now.getTime() + paymentWindowHours * 60 * 60 * 1000);

  // Parse event start time from bookingDate + bookingTime in partner's timezone.
  // NOTE: parseDateInTZ only accepts YYYY-MM-DD (no time component), so we
  // construct the datetime directly using the timezone's UTC offset.
  let eventStart = null;
  if (bookingDate && bookingTime) {
    const dateStr = String(bookingDate).trim().substring(0, 10);
    const timeStr = String(bookingTime).trim().substring(0, 5);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{2}:\d{2}$/.test(timeStr)) {
      const { getUTCOffsetForTZ } = require('../utils/timeService');
      const offset = getUTCOffsetForTZ(partnerTZ);
      const eventStartParsed = new Date(`${dateStr}T${timeStr}:00${offset}`);
      if (!isNaN(eventStartParsed.getTime())) {
        eventStart = eventStartParsed;
      }
    }
  }

  // If no valid event start, use window deadline alone
  if (!eventStart) {
    return {
      deadline: windowDeadline,
      allowed: true,
      description: `${paymentWindowHours}h payment window (no event start time available)`
    };
  }

  const safetyDeadline = new Date(eventStart.getTime() - safetyBufferHours * 60 * 60 * 1000);

  // If safety deadline has already passed → booking window is closed
  if (safetyDeadline <= now) {
    return {
      deadline: now,
      allowed: false,
      reason: 'PAYMENT_WINDOW_CLOSED',
      message: `Bookings close ${safetyBufferHours} hours before the event. This event starts too soon to accept new bookings.`,
      description: 'Safety buffer exceeded — event starts too soon'
    };
  }

  // Use whichever deadline comes first
  const effectiveDeadline = windowDeadline < safetyDeadline ? windowDeadline : safetyDeadline;

  // If effective deadline is in the past or essentially now → block
  if (effectiveDeadline <= now) {
    return {
      deadline: now,
      allowed: false,
      reason: 'PAYMENT_WINDOW_CLOSED',
      message: 'Payment window has closed for this event.',
      description: 'Effective deadline is in the past'
    };
  }

  const description = effectiveDeadline === windowDeadline
    ? `${paymentWindowHours}h payment window`
    : `Safety buffer: ${safetyBufferHours}h before event start`;

  return { deadline: effectiveDeadline, allowed: true, description };
}

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY: Dynamic Expiry Calculation
// Rules:
//   1. Booking made >24h before event start → Expires 24h after booking
//   2. Booking made ≤24h before event start → Expires at (event_start − 60 min)
//   3. Booking attempt after (event_start − 60 min) → REJECT
// ═══════════════════════════════════════════════════════════════════════
async function calculateInventoryExpiry(bookingDate, bookingTime, partnerTZ = 'Asia/Kolkata', options = {}) {
  // Fetch configurable values from system_settings (with code defaults)
  let defaultExpiryHours = 24;
  let cutoffMinutes = 60;
  let allowInstant = false;
  let instantExpiryMinutes = 15;

  try {
    const expirySetting = await settingsRepository.getSystemSetting('inventory_default_expiry_hours');
    if (expirySetting) defaultExpiryHours = parseFloat(expirySetting) || 24;
    const cutoffSetting = await settingsRepository.getSystemSetting('inventory_cutoff_minutes_before_event');
    if (cutoffSetting) cutoffMinutes = parseInt(cutoffSetting, 10) || 60;
    const instantSetting = await settingsRepository.getSystemSetting('inventory_allow_instant_booking');
    if (instantSetting === 'true') allowInstant = true;
    const instantExpSetting = await settingsRepository.getSystemSetting('inventory_instant_booking_expiry_minutes');
    if (instantExpSetting) instantExpiryMinutes = parseInt(instantExpSetting, 10) || 15;
  } catch (_) {
    // Use defaults if settings unavailable
  }

  // Allow caller overrides (e.g. for testing)
  if (options.defaultExpiryHours != null) defaultExpiryHours = options.defaultExpiryHours;
  if (options.cutoffMinutes != null) cutoffMinutes = options.cutoffMinutes;
  if (options.allowInstant != null) allowInstant = options.allowInstant;

  const now = new Date();

  // Determine event start time.
  // Priority: options.eventStartTime (the event's REAL start_time from DB) > bookingDate+bookingTime parsing.
  // If eventStartTime is explicitly null → open-ended event (no cutoff) → eventStart stays null → 24h fallback.
  // If eventStartTime is undefined → legacy path: parse from bookingDate+bookingTime (backward compat).
  let eventStart = null;
  if (options.eventStartTime !== undefined) {
    // Caller explicitly provided the event's real start_time (or null for open-ended)
    if (options.eventStartTime) {
      const parsed = new Date(options.eventStartTime);
      if (!isNaN(parsed.getTime())) eventStart = parsed;
    }
    // If eventStartTime is null → eventStart stays null → 24h fallback applies
  } else {
    // Legacy path: parse from bookingDate + bookingTime in partner's timezone
    if (bookingDate && bookingTime) {
      const dateStr = String(bookingDate).trim().substring(0, 10);
      const timeStr = String(bookingTime).trim().substring(0, 5);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{2}:\d{2}$/.test(timeStr)) {
        const { getUTCOffsetForTZ } = require('../utils/timeService');
        const offset = getUTCOffsetForTZ(partnerTZ);
        const parsed = new Date(`${dateStr}T${timeStr}:00${offset}`);
        if (!isNaN(parsed.getTime())) eventStart = parsed;
      }
    }
  }

  // If no valid event start, fallback to defaultExpiryHours from now
  if (!eventStart) {
    return {
      expiresAt: new Date(now.getTime() + defaultExpiryHours * 60 * 60 * 1000),
      allowed: true,
      description: `${defaultExpiryHours}h reservation window (no event start time available)`
    };
  }

  const cutoff = new Date(eventStart.getTime() - cutoffMinutes * 60 * 1000);

  // Rule 3: If booking attempt is after cutoff
  if (now >= cutoff) {
    // Instant booking: allow walk-in / last-minute with short expiry window
    if (allowInstant) {
      return {
        expiresAt: new Date(now.getTime() + instantExpiryMinutes * 60 * 1000),
        allowed: true,
        instant: true,
        description: `Instant booking: ${instantExpiryMinutes}m reservation window`
      };
    }
    return {
      expiresAt: now,
      allowed: false,
      reason: 'BOOKING_TOO_LATE',
      message: `Bookings close ${cutoffMinutes} minutes before the event. This event starts too soon.`,
      description: `Cutoff: ${cutoffMinutes} min before event start`
    };
  }

  const msUntilEvent = eventStart.getTime() - now.getTime();
  const defaultExpiryMs = defaultExpiryHours * 60 * 60 * 1000;

  // Rule 1: If >24h before event → expires = now + 24h
  if (msUntilEvent > defaultExpiryMs) {
    return {
      expiresAt: new Date(now.getTime() + defaultExpiryMs),
      allowed: true,
      description: `${defaultExpiryHours}h reservation window (event is >24h away)`
    };
  }

  // Rule 2: If ≤24h before event → expires = eventStart − cutoffMinutes
  return {
    expiresAt: cutoff,
    allowed: true,
    description: `Reservation expires ${cutoffMinutes} min before event start`
  };
}

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY: Max Simultaneous Reservations (abuse prevention)
// ═══════════════════════════════════════════════════════════════════════
async function enforceMaxInventoryReservations(userId, executor) {
  let maxReservations = 3;
  try {
    const setting = await settingsRepository.getSystemSetting('max_inventory_reservations_per_user');
    if (setting) maxReservations = parseInt(setting, 10) || 3;
  } catch (_) {}

  const countResult = await executor.query(
    `SELECT COUNT(*) as cnt FROM bookings WHERE user_id = $1 AND status = 'temp_reserved'`,
    [userId]
  );
  const activeCount = parseInt(countResult.rows[0].cnt, 10);
  if (activeCount >= maxReservations) {
    throw new AppError(429, `You have ${activeCount} active event reservations. Maximum ${maxReservations} simultaneous reservations allowed. Please complete or cancel an existing reservation first.`);
  }
}

/**
 * Partner confirms that payment has been received for an event booking.
 * Transitions: payment_pending → confirmed, voucher: booked → active.
 * @param {string} bookingId - UUID of the booking
 * @param {string} partnerId - UUID of the partner (ownership check)
 * @param {string} partnerUserId - UUID of the partner's user account (who confirmed)
 * @param {{ payment_proof_url?: string }} options
 */
async function confirmEventPayment(bookingId, partnerId, partnerUserId, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the booking row (FOR UPDATE OF b — cannot lock nullable side of LEFT JOIN)
    const bResult = await client.query(
      `SELECT b.*, po.partner_id AS offer_partner_id
       FROM bookings b
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       WHERE b.id = $1
       FOR UPDATE OF b`,
      [bookingId]
    );

    if (bResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found');
    }

    const booking = bResult.rows[0];
    const effectivePartnerId = booking.offer_partner_id || booking.partner_id;

    // Ownership check
    if (String(effectivePartnerId) !== String(partnerId)) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'This booking does not belong to your venue');
    }

    // INVENTORY bookings skip payment confirmation — they use direct redemption at POS
    if (booking.booking_category === 'INVENTORY' || booking.status === 'temp_reserved') {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Event bookings use direct redemption at the venue. No separate payment confirmation needed.');
    }

    // Status check
    if (booking.status !== 'payment_pending') {
      await client.query('ROLLBACK');
      if (booking.status === 'confirmed') {
        throw new AppError(400, 'Payment has already been confirmed for this booking');
      }
      if (booking.status === 'expired') {
        throw new AppError(400, 'This booking has expired. The payment deadline has passed.');
      }
      throw new AppError(400, `Cannot confirm payment for a booking with status "${booking.status}"`);
    }

    // Deadline check — partner can still confirm slightly after deadline (grace)
    // but cron job may have already expired it, caught by status check above
    if (booking.payment_deadline && new Date(booking.payment_deadline) < new Date()) {
      // Only warn, don't block — if status is still payment_pending, the cron hasn't run yet
      log(`⚠️ Payment confirmation received after deadline for booking ${bookingId} — allowing since status is still payment_pending`);
    }

    // Update booking: payment_pending → confirmed
    const now = new Date();
    const updateFields = {
      confirmed_at: now,
      confirmed_by_partner_user_id: partnerUserId
    };
    if (options.payment_proof_url) {
      updateFields.payment_proof_url = options.payment_proof_url;
    }

    await bookingRepository.updateBookingStatus(bookingId, 'confirmed', updateFields, client);

    // Transition voucher: booked → active
    // This is critical — if it fails, the booking says confirmed but voucher is still 'booked'.
    // We attempt the transition, and if it fails we still try a direct UPDATE as a fallback.
    try {
      const voucherStateMachine = require('./voucherStateMachine');
      await voucherStateMachine.transitionState({
        bookingId: bookingId,
        voucherCode: booking.voucher_code,
        fromState: 'booked',
        toState: 'active',
        actorId: partnerUserId,
        actorRole: 'partner',
        reasonCode: 'payment_confirmed',
        reasonText: 'Partner confirmed payment received',
        executor: client
      });
    } catch (vErr) {
      logError('⚠️ Voucher booked→active transition failed during payment confirm — attempting direct fallback:', vErr);
      // Fallback: update voucher_state directly so booking and voucher stay in sync
      try {
        await client.query(
          `UPDATE bookings SET voucher_state = 'active' WHERE id = $1`,
          [bookingId]
        );
        log(`✅ Fallback voucher_state → active applied for booking ${bookingId}`);
      } catch (fallbackErr) {
        logError('❌ Fallback voucher_state update also failed — rolling back entire confirm:', fallbackErr);
        throw new AppError(500, 'Failed to activate voucher after payment confirmation. Please try again.');
      }
    }

    // Audit log
    await writeAuditWithExecutor(client, partnerUserId, 'partner', 'event_payment_confirmed', 'booking', bookingId, {
      previous_status: 'payment_pending',
      new_status: 'confirmed',
      partner_id: partnerId,
      booking_reference: booking.booking_reference,
      payment_proof_url: options.payment_proof_url || null
    });

    await client.query('COMMIT');

    // Post-commit: notify user
    try {
      const notificationService = require('./notificationService');
      let dealTitle = null;
      if (booking.deal_id) {
        const offer = await offerRepository.getOfferById(booking.deal_id, false);
        dealTitle = offer?.title;
      }
      await notificationService.create({
        userId: booking.user_id,
        type: 'event_payment_confirmed',
        title: 'Payment Confirmed — Voucher Active!',
        message: `Your payment for ${dealTitle || 'the event'} has been confirmed by the venue. Your voucher is now active. Ref: ${booking.booking_reference}.`,
        actionUrl: `/bookings/${bookingId}`,
        priority: 'high',
        metadata: { booking_id: bookingId, booking_reference: booking.booking_reference },
        sentViaInApp: true,
        sentViaPush: true,
      });
    } catch (notifErr) {
      logError('Payment confirmed notification failed (non-fatal):', notifErr);
    }

    // Emit real-time event
    emitRealtimeEvent(REALTIME_EVENTS.BOOKING_CREATED, {
      action: 'payment_confirmed',
      bookingId,
      status: 'confirmed',
      userId: booking.user_id,
      partnerId,
      timestamp: new Date().toISOString()
    });
    emitToRoom(`users:${booking.user_id}`, REALTIME_EVENTS.BOOKING_CREATED, {
      action: 'payment_confirmed',
      bookingId,
      status: 'confirmed'
    });

    log(`✅ Event payment confirmed for booking ${bookingId} by partner user ${partnerUserId}`);
    return { success: true, bookingId, status: 'confirmed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Partner cancels an event booking (payment_pending or confirmed).
 * For confirmed bookings, cancellation_reason is mandatory.
 * @param {string} bookingId
 * @param {string} partnerId
 * @param {string} partnerUserId
 * @param {{ cancellation_reason?: string }} options
 */
async function partnerCancelEventBooking(bookingId, partnerId, partnerUserId, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bResult = await client.query(
      `SELECT b.*, po.partner_id AS offer_partner_id
       FROM bookings b
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       WHERE b.id = $1
       FOR UPDATE OF b`,
      [bookingId]
    );

    if (bResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Booking not found');
    }

    const booking = bResult.rows[0];
    const effectivePartnerId = booking.offer_partner_id || booking.partner_id;

    if (String(effectivePartnerId) !== String(partnerId)) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'This booking does not belong to your venue');
    }

    const cancellableStatuses = ['payment_pending', 'confirmed'];
    if (!cancellableStatuses.includes(booking.status)) {
      await client.query('ROLLBACK');
      throw new AppError(400, `Cannot cancel a booking with status "${booking.status}"`);
    }

    // For confirmed bookings, require a reason
    if (booking.status === 'confirmed' && !options.cancellation_reason) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Cancellation reason is required when cancelling a confirmed booking');
    }

    const reason = options.cancellation_reason || 'Cancelled by venue';

    await bookingRepository.updateBookingStatus(bookingId, 'cancelled', {
      cancelled_at: new Date(),
      cancellation_reason: reason,
      cancelled_by: 'partner'
    }, client);

    // Voucher state transition
    try {
      const voucherStateMachine = require('./voucherStateMachine');
      const fromState = booking.status === 'payment_pending' ? 'booked' : 'active';
      await voucherStateMachine.transitionState({
        bookingId,
        voucherCode: booking.voucher_code,
        fromState,
        toState: 'cancelled',
        actorId: partnerUserId,
        actorRole: 'partner',
        reasonCode: 'partner_cancelled',
        reasonText: reason,
        executor: client
      });
    } catch (vErr) {
      logError('⚠️ Voucher cancel transition failed (non-fatal):', vErr);
    }

    // Audit
    await writeAuditWithExecutor(client, partnerUserId, 'partner', 'booking_cancelled_by_partner', 'booking', bookingId, {
      previous_status: booking.status,
      new_status: 'cancelled',
      cancellation_reason: reason,
      cancelled_by: 'partner',
      partner_id: partnerId,
      booking_reference: booking.booking_reference,
      deal_id: booking.deal_id,
      booking_date: booking.booking_date,
      booking_time: String(booking.booking_time || '').slice(0, 5),
    });

    // Release slots
    const partySize = booking.num_tickets || booking.num_guests || 1;
    if (booking.deal_id && booking.booking_date) {
      try {
        await slotCapacityService.releaseDealSlot(client, booking.deal_id, booking.booking_date, booking.booking_time, partySize);
      } catch (e) {
        logError(`⚠️ Failed to release deal slot for partner-cancelled booking ${bookingId}:`, e);
      }
    }
    if (booking.partner_id && booking.booking_date && booking.booking_time) {
      try {
        const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
        if (slotDt) {
          await slotCapacityService.releaseSlot(client, booking.partner_id, slotDt, partySize);
        }
      } catch (e) {
        logError(`⚠️ Failed to release venue slot for partner-cancelled booking ${bookingId}:`, e);
      }
    }

    await client.query('COMMIT');

    // Post-commit: notify user
    try {
      const notificationService = require('./notificationService');
      let dealTitle = null;
      if (booking.deal_id) {
        const offer = await offerRepository.getOfferById(booking.deal_id, false);
        dealTitle = offer?.title;
      }
      await notificationService.create({
        userId: booking.user_id,
        type: 'booking_cancelled_by_partner',
        title: 'Booking Cancelled by Venue',
        message: `Your booking for ${dealTitle || 'the event'} has been cancelled by the venue. Reason: ${reason}. Ref: ${booking.booking_reference}.`,
        actionUrl: `/bookings/${bookingId}`,
        priority: 'high',
        metadata: { booking_id: bookingId, booking_reference: booking.booking_reference, cancellation_reason: reason },
        sentViaInApp: true,
        sentViaPush: true,
      });
    } catch (notifErr) {
      logError('Partner cancel notification failed (non-fatal):', notifErr);
    }

    // FIFO: Promote next waitlist user when slot opens
    if (booking.partner_id && booking.booking_date && booking.booking_time) {
      const dateStr = slotCapacityService.toDateString ? slotCapacityService.toDateString(booking.booking_date) : String(booking.booking_date).trim().substring(0, 10);
      const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
      if (dateStr && timeStr) {
        const promote = booking.deal_id
          ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
          : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
        promote
          .then((result) => {
            if (result) {
              if (result.booking) log(`🔔 FIFO waitlist: promoted user ${result.waitlistEntry?.user_id} for partner-cancelled slot ${dateStr} ${timeStr}`);
              else log(`🔔 FIFO waitlist: notified user ${result.user_id} for partner-cancelled slot ${dateStr} ${timeStr}`);
            }
          })
          .catch((err) => logError('⚠️ Waitlist promote/notify failed (non-fatal):', err));
      }
    }

    log(`✅ Booking ${bookingId} cancelled by partner ${partnerId} (reason: ${reason})`);
    return { success: true, bookingId, status: 'cancelled' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createBooking,
  listBookings,
  getBookingById,
  rescheduleBooking,
  cancelBooking,
  confirmPayment,
  calculatePaymentDeadline,
  calculateInventoryExpiry,
  confirmEventPayment,
  partnerCancelEventBooking
};
