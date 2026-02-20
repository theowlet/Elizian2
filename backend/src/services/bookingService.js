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
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { emitRealtimeEvent, emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');
const { generateAndUploadQRCode } = require('../utils/qrCodeGenerator');
const { normalizeTierName } = require('../utils/tierNames');

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
      booking_time
    } = bookingData;

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
      bookingPayload.status = 'confirmed';
    } else if (offer_id) {
      // Offer booking: fetch without partner filter first to return a specific error
      let offer = await offerRepository.getOfferById(offer_id, false);
      if (!offer) {
        const raw = await offerRepository.getOfferByIdRaw(offer_id);
        if (!raw) {
          await client.query('ROLLBACK');
          throw new AppError(404, "Offer not found");
        }
        await client.query('ROLLBACK');
        const status = (raw.status && String(raw.status).toLowerCase().trim()) || '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (status !== 'active' && !raw.is_active) {
          throw new AppError(400, "This deal is not active. It may be draft, paused, or rejected. Please select another deal.");
        }
        if (raw.start_date && new Date(raw.start_date).toDateString() > today.toDateString()) {
          throw new AppError(400, "This deal is not yet open for booking. Please try again from the start date.");
        }
        if (raw.end_date && new Date(raw.end_date).toDateString() < today.toDateString()) {
          throw new AppError(400, "This deal's booking period has ended. Please select another deal.");
        }
        const pStatus = (raw.partner_status && String(raw.partner_status).toLowerCase().trim()) || '';
        if (['suspended', 'rejected'].includes(pStatus)) {
          throw new AppError(400, "This partner is not accepting bookings. Please select another deal.");
        }
        throw new AppError(400, "This deal is not currently available for booking. Please try again or select another deal.");
      }
      const offerStatus = (offer.status && String(offer.status).toLowerCase().trim()) || '';
      if (offerStatus !== 'active') {
        await client.query('ROLLBACK');
        throw new AppError(400, "This deal is not active and cannot be booked. Please select another deal.");
      }
      const now = new Date();
      if (offer.start_date && new Date(offer.start_date) > now) {
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
      bookingPayload.status = 'confirmed';
      // Snapshot deal co-pay at booking time so redemption uses terms that applied when user booked.
      // Backward-compat: some deployments still have legacy discount_percentage.
      const rawCoPay = offer.co_pay_percentage != null ? offer.co_pay_percentage : offer.discount_percentage;
      const coPayPct = rawCoPay != null ? parseFloat(rawCoPay) : NaN;
      bookingPayload.co_pay_percentage_at_booking = Number.isFinite(coPayPct)
        ? Math.min(100, Math.max(0, coPayPct))
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
        const bookingType = event_id ? 'event' : (offer_id ? 'offer' : 'show');
        // STABILIZATION FIX: Pass transaction client to redeemTokens to ensure
        // token balance check + deduction is atomic within the booking transaction.
        // Prevents concurrent bookings from overdrawing EZT balance.
        const redeemResult = await tokenService.redeemTokens(user_id, parseFloat(ezt_to_redeem), null, `Redeemed for ${bookingType} booking`, client);
        eztRedeemed = redeemResult.eztRedeemed;
        eztDiscount = redeemResult.discountAmount;
        // BUG FIX #6: Subtract from already discounted amount (finalAmount), not original amount
        finalAmount = Math.max(0, finalAmount - eztDiscount);
      } catch (redeemError) {
        await client.query('ROLLBACK');
        throw new AppError(400, `EZT redemption failed: ${redeemError.message}`);
      }
    }

    const partner_earning = finalAmount - (finalAmount * commission_percentage / 100);

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
    
    // Get deal/event title
    if (offer_id) {
      const offer = await offerRepository.getOfferById(offer_id, true);
      dealTitle = offer?.title || null;
    } else if (event_id) {
      const event = await eventRepository.getEventById(event_id);
      dealTitle = event?.title || null;
    }
    
    // Get partner name
    if (partner_id) {
      try {
        const partner = await partnerRepository.getPartnerById(partner_id);
        partnerName = partner?.name || null;
      } catch (partnerError) {
        logError('⚠️ Could not fetch partner name for QR code:', partnerError);
        // Continue without partner name
      }
    }
    
    // Extract booking date and time from multiple sources (priority order):
    // 1. Direct booking_date/booking_time (for events, passed from frontend)
    // 2. reservation_data.date/time (for dining)
    // 3. Current date/time (fallback — for storage only, NOT validated against hours)
    // CRITICAL: Check booking_date and booking_time FIRST (before bookingPayload which is empty initially)
    let bookingDate = booking_date || null;
    let bookingTime = booking_time || null;

    // Only fallback to bookingPayload if direct values are not provided
    if (!bookingDate) {
      bookingDate = bookingPayload.booking_date || null;
    }
    if (!bookingTime) {
      bookingTime = bookingPayload.booking_time || null;
    }

    // CRITICAL: Log the initial values to debug time extraction
    log(`🔍 Booking time extraction - Initial: booking_time=${booking_time}, bookingPayload.booking_time=${bookingPayload.booking_time}, reservation_data=${JSON.stringify(reservation_data)}`);

    if (reservation_data) {
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

    // Default date/time for STORAGE and validation. For events with no date/time, use event start_time.
    if (!bookingDate || !bookingTime) {
      if (serviceType === 'events' && eventStartTimeForDefault) {
        const d = new Date(eventStartTimeForDefault);
        if (!bookingDate) bookingDate = d.toISOString().split('T')[0];
        if (!bookingTime) bookingTime = d.toTimeString().slice(0, 5);
        log(`⚠️ No booking date/time provided, using event start for record/validation: ${bookingDate} ${bookingTime}`);
      } else {
        if (!bookingDate) {
          bookingDate = new Date().toISOString().split('T')[0];
          log(`⚠️ No booking date provided, using current date for record: ${bookingDate}`);
        }
        if (!bookingTime) {
          bookingTime = new Date().toTimeString().slice(0, 5);
          log(`⚠️ No booking time provided, using current time for record: ${bookingTime}`);
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
    // CRITICAL: OPERATING HOURS + ECHELON VALIDATION
    // ============================================
    // For time-based services (dining, events, shows): ALWAYS validate against
    // operating hours — default to current time if user didn't provide one.
    // For non-time-based services (spa, wellness, travel, etc.): skip this check
    // because the user is purchasing a voucher, not reserving a specific time slot.
    // Echelon tier can override CAPACITY, but NOT operating hours.

    if (requiresHoursValidation && partner_id) {
      log(`🔍 Validating booking time: ${bookingDate} ${bookingTime} for partner ${partner_id}`);

      const validation = await bookingValidation.validateBookingRequest({
        partner_id,
        user_id,
        booking_date: bookingDate,
        booking_time: bookingTime,
        party_size: num_tickets || 1,
        user_tier: userTierAtBooking
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

      // Concurrency-safe slot reserve (venue_time_slots). If table missing, LEGACY and we do not touch slots.
      let slotReserved = false;
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
        bookingPayload._slotReserved = slotReserved;
      }
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

    // STABILIZATION FIX: Set voucher expiration to prevent indefinite redemption window
    // Uses the earlier of: offer end_date or 30 days from now.
    // Without this, vouchers for expired offers could be redeemed months later.
    if (offer_id) {
      const offerForExpiry = await offerRepository.getOfferById(offer_id, false);
      if (offerForExpiry && offerForExpiry.end_date) {
        const offerEnd = new Date(offerForExpiry.end_date);
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        bookingPayload.expires_at = offerEnd < thirtyDaysFromNow ? offerEnd : thirtyDaysFromNow;
      } else {
        bookingPayload.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else if (event_id) {
      // Events: expire voucher 24 hours after the event date
      const eventExpiry = bookingDate
        ? new Date(new Date(bookingDate).getTime() + 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      bookingPayload.expires_at = eventExpiry;
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

    // Transition state: CREATED → BOOKED → ACTIVE (if confirmed) or CREATED → BOOKED (if pending)
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
        // Check if offer is for dining (already validated, but keep approval check for consistency)
        const offer = await offerRepository.getOfferById(offer_id, true);
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
    if (!dealTitle) {
      if (offer_id) {
        // Get offer title (already validated, but keep approval check for consistency)
        const offer = await offerRepository.getOfferById(offer_id, true);
        dealTitle = offer?.title || null;
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
      await notificationService.create({
        userId: user_id,
        type: 'booking_created',
        title: 'Booking confirmed',
        message: `Your booking for ${dealTitle || 'your deal'} is confirmed. Voucher: ${booking.voucher_code || booking.booking_reference}.`,
        actionUrl: `/bookings/${booking.id}`,
        priority: 'high',
        metadata: { booking_id: booking.id, offer_name: dealTitle, booking_date: bookingDate, voucher_code: booking.voucher_code },
        sentViaInApp: true,
        sentViaPush: true,
      });
      if (partner_id) {
        const partner = await partnerRepository.getPartnerById(partner_id);
        const partnerUserId = partner?.user_id || partner?.owner_user_id;
        if (partnerUserId) {
          await notificationService.create({
            userId: partnerUserId,
            type: 'booking_received',
            title: 'New booking',
            message: `New booking for ${dealTitle || 'deal'}. Ref: ${booking.booking_reference}. Voucher: ${booking.voucher_code || '—'}.`,
            actionUrl: `/partner/bookings`,
            priority: 'high',
            metadata: { booking_id: booking.id, offer_name: dealTitle, booking_date: bookingDate, voucher_code: booking.voucher_code },
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
    // Release slot capacity if it was reserved in this transaction (cross-vertical: dining/slots)
    // Must run in standalone transaction so decrement commits even when this transaction rolls back
    if (typeof bookingPayload !== 'undefined' && bookingPayload && bookingPayload._slotReserved && partner_id && bookingDate && bookingTime) {
      const slotDt = slotCapacityService.toSlotDatetime(bookingDate, bookingTime);
      if (slotDt) {
        const partySize = (bookingPayload.num_guests ?? bookingPayload.num_tickets ?? num_tickets) || 1;
        await slotCapacityService.releaseSlotStandalone(partner_id, slotDt, partySize).catch((e) => {
          logError('Release slot on rollback failed (slot count may be stale):', e);
        });
      }
    }
    await client.query('ROLLBACK');
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

    // Validate new date is not in the past (must be today or future)
    const newDate = new Date(booking_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (newDate < today) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Cannot reschedule to a past date');
    }

    // Update booking date and time
    // CRITICAL: If booking_time is not provided, preserve existing time
    // This prevents defaulting to 12:00 AM when time is not specified
    const timeToUpdate = booking_time || booking.booking_time || null;
    
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
    logError('❌ Reschedule booking error:', error);
    throw new AppError(500, `Failed to reschedule booking: ${error.message}`);
  } finally {
    client.release();
  }
}

// Confirm payment for booking
async function confirmPayment(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const booking = await bookingRepository.getBookingByIdForUpdate(bookingId);
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

module.exports = {
  createBooking,
  listBookings,
  getBookingById,
  rescheduleBooking,
  confirmPayment
};
