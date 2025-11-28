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
const loyaltyEngine = require('../../services/loyaltyEngineService');
const tierService = require('./tierService');
const bankOfferService = require('./bankOfferService');
const reservationService = require('./reservationService');
const preOrderService = require('./preOrderService');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');
const { emitRealtimeEvent, emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');

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
      pre_order_data // { items, specialInstructions, dietaryRequirements } - Echelon tier only
    } = bookingData;

    if (!event_id && !offer_id && !show_id) {
      throw new AppError(400, "Either event_id, offer_id, or show_id is required");
    }

    await client.query('BEGIN');

    let bookingPayload = { user_id, num_tickets, special_requests };
    let amount = 0;
    let partner_id = null;
    let commission_percentage = 10.0;

    // Get commission percentage from system settings
    const commissionSetting = await settingsRepository.getSystemSetting('commission_percentage');
    if (commissionSetting) {
      commission_percentage = parseFloat(commissionSetting) || 10.0;
    }

    if (event_id) {
      // Event booking
      const event = await eventRepository.getEventById(event_id);
      if (!event) {
        await client.query('ROLLBACK');
        throw new AppError(404, "Event not found or not active");
      }

      partner_id = event.partner_id;

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
      // Offer booking
      const offer = await offerRepository.getOfferById(offer_id);
      if (!offer) {
        await client.query('ROLLBACK');
        throw new AppError(404, "Offer not found or expired");
      }

      partner_id = offer.partner_id;

      // Check redemptions limit
      if (offer.max_redemptions && (offer.current_redemptions || 0) >= offer.max_redemptions) {
        await client.query('ROLLBACK');
        throw new AppError(400, "Offer redemption limit reached");
      }

      amount = parseFloat(offer.discounted_price || offer.original_price || 0);
      bookingPayload.deal_id = offer_id;  // Use deal_id to match table schema
      bookingPayload.offer_id = offer_id;  // Keep for backwards compatibility
      bookingPayload.status = 'confirmed';
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
        const redeemResult = await tokenService.redeemTokens(user_id, parseFloat(ezt_to_redeem), null, `Redeemed for ${bookingType} booking`);
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

    // Create booking
    bookingPayload.amount = finalAmount;
    bookingPayload.fiat_amount = amount;  // Original amount before EZT discount
    bookingPayload.ezt_redeemed = eztRedeemed;
    bookingPayload.partner_id = partner_id;
    bookingPayload.reward_eligible = true;
    bookingPayload.booking_type = bookingType;  // BUG FIX #5: Store booking type
    bookingPayload.commission_percentage = commission_percentage;  // For transaction record
    bookingPayload.partner_earning = partner_earning;  // For transaction record
    const booking = await bookingRepository.createBooking(bookingPayload, client);  // BUG FIX #2: Pass client for transaction

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

    // Update offer redemption count if offer booking
    if (offer_id) {
      await offerRepository.incrementOfferRedemptions(offer_id);
    }

    // Create table reservation if provided (for dining offers)
    let reservation = null;
    if (reservation_data && offer_id && partner_id) {
      try {
        // Check if offer is for dining
        const offer = await offerRepository.getOfferById(offer_id);
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
            seating_preference: reservation_data.seatingPreference
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
    // BUG FIX #3, #4, #7: Process tier, loyalty, and enrichment BEFORE COMMIT
    // ====================================================================
    
    let tierResult = null;
    let eztEarned = 0;
    
    // Process tier rewards and check for tier upgrade
    try {
      // Process tier logic (adds to annual spend, checks for upgrade, calculates EZT reward)
      tierResult = await tierService.processBookingWithTier(user_id, finalAmount);
      eztEarned = tierResult.eztEarned;
      
      // Update booking with tier information (within transaction)
      await bookingRepository.updateBookingTierInfo(booking.id, {
        ezt_earned: eztEarned,
        ezt_reward_percentage: tierResult.rewardPercentage,
        user_tier_at_booking: tierResult.tierAtBooking
      }, client);  // BUG FIX #3: Pass client to stay within transaction
      
      log(`Tier processing for booking ${booking.id}: EZT=${eztEarned}, Tier=${tierResult.tierAtBooking}, Upgrade=${tierResult.tierUpgrade ? `${tierResult.tierUpgrade.from}→${tierResult.tierUpgrade.to}` : 'none'}`);
      
      // If tier was upgraded, log it
      if (tierResult.tierUpgrade && tierResult.tierUpgrade.upgraded) {
        log(`🎉 User ${user_id} upgraded from ${tierResult.tierUpgrade.from} to ${tierResult.tierUpgrade.to} tier!`);
      }
    } catch (tierError) {
      // If tier processing fails, rollback entire booking
      await client.query('ROLLBACK');
      logError('Tier processing failed, rolling back booking:', tierError);
      throw new AppError(500, `Booking failed during tier processing: ${tierError.message}`);
    }
    
    // Award EZT tokens (if tier processing didn't already calculate it)
    if (!tierResult || eztEarned === 0) {
      eztEarned = await tokenService.awardTokens(user_id, finalAmount, transaction.id, `Earned from ${bookingType} booking`);
    }
    
    // Update transaction with earned tokens (within transaction)
    await transactionRepository.updateTransactionTokens(transaction.id, eztEarned, eztEarned - eztRedeemed, client);

    // BUG FIX #7: Use finalAmount (actual paid amount) for loyalty points calculation
    const earningPreview = await loyaltyEngine.calculateEarning(user_id, finalAmount);
    const pointsEarned = earningPreview.points;

    const loyaltyMetadata = { booking_reference: booking.booking_reference };
    if (show_id) {
      loyaltyMetadata.show_id = show_id;
      loyaltyMetadata.seat_template_ids = bookingPayload.seat_template_ids;
    }

    const loyaltyResult = await loyaltyEngine.recordActivity({
      userId: user_id,
      source: 'booking',
      referenceId: booking.id,
      amount: finalAmount,  // BUG FIX #7: Use finalAmount, not original amount
      pointsEarned,
      description: `Points earned from ${bookingType} booking`,
      metadata: loyaltyMetadata
    });

    booking.points_earned = pointsEarned;
    booking.loyalty_balance = loyaltyResult.balanceAfter;

    // BUG FIX #4: Enrich booking response with deal/offer title (BEFORE commit, inside try)
    let dealTitle = null;
    if (offer_id) {
      const offer = await offerRepository.getOfferById(offer_id);
      dealTitle = offer?.title || null;
    } else if (event_id) {
      const event = await eventRepository.getEventById(event_id);
      dealTitle = event?.title || null;
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

    return booking;
  } catch (err) {
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
  confirmPayment
};

