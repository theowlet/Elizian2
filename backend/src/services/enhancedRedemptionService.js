/**
 * Enhanced Redemption Service
 * Enterprise-grade redemption with state machine, validation, audit logging, and settlement tracking
 */

const { getPool } = require('../config/db');
const voucherStateMachine = require('./voucherStateMachine');
const redemptionValidationService = require('./redemptionValidationService');
const voucherAuditService = require('./voucherAuditService');
const tierService = require('./tierService');
const loyaltyEngine = require('../../services/loyaltyEngineService');
const tokenService = require('./tokenService');
const redemptionCalculationService = require('./redemptionCalculationService');
const { applyBookingTimeCoPay, EZT_TO_INR } = redemptionCalculationService;
const visitSessionRepository = require('../repositories/visitSessionRepository');
const partnerTierRepository = require('../repositories/partnerTierRepository');
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');
const { emitToRoom, REALTIME_EVENTS } = require('../utils/realtimeEmitter');

const DUAL_CONFIRMATION_ENABLED = process.env.DUAL_CONFIRMATION_ENABLED === 'true' || process.env.DUAL_CONFIRMATION_ENABLED === '1';
// When true: partner can redeem only after customer has checked in at venue (app check-in). Default false = redemption allowed without check-in.
const REQUIRE_VISIT_SESSION_FOR_REDEMPTION = process.env.REQUIRE_VISIT_SESSION_FOR_REDEMPTION === 'true' || process.env.REQUIRE_VISIT_SESSION_FOR_REDEMPTION === '1';
// Hours after partner redemption during which the customer can dispute (e.g. 24). Partner redeem is always final; only dispute is time-limited.
const DISPUTE_WINDOW_HOURS = Math.max(0, parseInt(process.env.DISPUTE_WINDOW_HOURS || '24', 10)) || 24;

const pool = getPool();

/** Haversine distance in km */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Enhanced voucher redemption with enterprise features
 * @param {Object} redemptionData - Redemption details
 * @param {Object} context - Request context (IP, user agent, actor info)
 * @returns {Object} Redemption record with settlement info
 */
async function redeemVoucherEnhanced(redemptionData, context = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      voucher_code,
      partner_id,
      total_bill_amount,
      ezt_co_pay_amount,
      net_amount_from_user,
      redeemed_by_user_id = null,
      redemption_notes = null,
      redemption_latitude = null,
      redemption_longitude = null
    } = redemptionData;

    const {
      actorId = partner_id,
      actorRole = 'partner',
      ipAddress = null,
      userAgent = null
    } = context;

    // Log redemption attempt
    await voucherAuditService.logAuditEvent({
      voucherCode: voucher_code,
      action: 'redemption_attempt',
      actorId: actorId,
      actorRole: actorRole,
      requestData: {
        voucher_code,
        partner_id,
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user
      },
      ipAddress: ipAddress,
      userAgent: userAgent,
      executor: client
    });

    // Validation
    if (!voucher_code) {
      await voucherAuditService.logAuditEvent({
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { error: 'Voucher code is required' },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, 'Voucher code is required');
    }

    if (!partner_id) {
      await voucherAuditService.logAuditEvent({
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { error: 'Partner ID is required' },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, 'Partner ID is required');
    }

    // Financial validation
    if (total_bill_amount === undefined || total_bill_amount < 0) {
      throw new AppError(400, 'Total bill amount is required and must be >= 0');
    }
    if (ezt_co_pay_amount === undefined || ezt_co_pay_amount < 0) {
      throw new AppError(400, 'EZT co-pay amount is required and must be >= 0');
    }
    if (net_amount_from_user === undefined || net_amount_from_user < 0) {
      throw new AppError(400, 'Net amount from user is required and must be >= 0');
    }

    const calculatedNet = total_bill_amount - ezt_co_pay_amount;
    if (Math.abs(net_amount_from_user - calculatedNet) > 0.01) {
      throw new AppError(400, `Net amount from user (${net_amount_from_user}) must equal total bill (${total_bill_amount}) minus EZT co-pay (${ezt_co_pay_amount})`);
    }

    // Get booking with lock (include co_pay_percentage_at_booking for redemption by booking-time terms)
    let bookingResult;
    try {
      bookingResult = await client.query(
        `SELECT 
          b.id, b.user_id, b.partner_id, b.deal_id, b.status, b.voucher_state,
          b.voucher_code, b.booking_reference, b.total_price, b.fiat_amount,
          b.booking_date, b.booking_time, b.expires_at, b.created_at,
          b.co_pay_percentage_at_booking,
          po.id as offer_id, po.end_date as offer_end_date
         FROM bookings b
         LEFT JOIN partner_offers po ON b.deal_id = po.id
         WHERE b.voucher_code = $1
         FOR UPDATE OF b`,
        [voucher_code]
      );
    } catch (colErr) {
      if (colErr.code === '42703' || /column .* does not exist/i.test(colErr.message || '')) {
        bookingResult = await client.query(
          `SELECT 
            b.id, b.user_id, b.partner_id, b.deal_id, b.status, b.voucher_state,
            b.voucher_code, b.booking_reference, b.total_price, b.fiat_amount,
            b.booking_date, b.booking_time, b.expires_at, b.created_at,
            po.id as offer_id, po.end_date as offer_end_date
           FROM bookings b
           LEFT JOIN partner_offers po ON b.deal_id = po.id
           WHERE b.voucher_code = $1
           FOR UPDATE OF b`,
          [voucher_code]
        );
        if (bookingResult.rows[0]) bookingResult.rows[0].co_pay_percentage_at_booking = null;
      } else {
        throw colErr;
      }
    }

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { error: 'Voucher not found' },
        ipAddress: ipAddress,
        userAgent: userAgent
      });
      throw new AppError(404, 'Voucher not found');
    }

    const booking = bookingResult.rows[0];
    booking.transaction_id = null;
    booking.tokens_redeemed = 0;
    // Get transaction ID associated with this booking (optional; non-fatal if missing or query fails)
    try {
      const createdAt = booking.created_at instanceof Date ? booking.created_at : new Date(booking.created_at);
      const transactionResult = await client.query(
        `SELECT id, tokens_redeemed 
         FROM transactions 
         WHERE user_id = $1 
           AND partner_id = $2 
           AND created_at >= $3::timestamptz - INTERVAL '2 minutes'
           AND created_at <= $3::timestamptz + INTERVAL '2 minutes'
         ORDER BY created_at DESC 
         LIMIT 1`,
        [booking.user_id, booking.partner_id, createdAt]
      );
      const transaction = transactionResult.rows[0] || null;
      if (transaction) {
        booking.transaction_id = transaction.id;
        booking.tokens_redeemed = parseFloat(transaction.tokens_redeemed || 0);
      }
    } catch (txErr) {
      logError('⚠️ Transaction lookup for redemption (non-fatal):', txErr.message);
    }

    // Get current state
    const currentState = booking.voucher_state || await voucherStateMachine.getCurrentState(booking.id, client);

    // CRITICAL: Validate state - Must be 'active' to redeem (P0 Fix #3)
    // This is the single source of truth for redemption eligibility
    if (!currentState || currentState !== 'active') {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: {
          error: 'Invalid voucher state for redemption',
          current_state: currentState,
          required_state: 'active',
          attempted_state: 'redeemed'
        },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      if (currentState === 'pending_confirmation') {
        throw new AppError(400, 'This voucher is already awaiting customer action. You cannot submit again until the customer confirms or disputes, or the dispute window closes.');
      }
      throw new AppError(400, `Cannot redeem voucher in state '${currentState}'. Voucher must be 'active'. Current state: ${currentState}`);
    }

    // Partner redeem is always final (active → redeemed). Customer can only dispute within dispute window.
    const targetState = 'redeemed';
    if (!voucherStateMachine.isValidTransition(currentState, targetState)) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { error: 'Invalid state transition', current_state: currentState, attempted_state: targetState },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, `Invalid state transition from '${currentState}' to '${targetState}'`);
    }

    if (DUAL_CONFIRMATION_ENABLED && REQUIRE_VISIT_SESSION_FOR_REDEMPTION) {
      const visitSession = await visitSessionRepository.getSessionByBookingId(booking.id, client);
      if (!visitSession) {
        await client.query('ROLLBACK');
        await voucherAuditService.logAuditEvent({
          voucherCode: voucher_code,
          action: 'redemption_failure',
          actorId: actorId,
          actorRole: actorRole,
          errorData: { error: 'No active visit session. Customer must check in at venue first.' },
          ipAddress: ipAddress,
          userAgent: userAgent,
          executor: client
        });
        throw new AppError(400, 'No active visit session. Customer must check in at venue first.');
      }
      booking.visit_session_id = visitSession.id;
    }

    const effectiveOfferId = booking.deal_id || booking.offer_id || null;
    let offerRow = await redemptionCalculationService.getOfferDiscount(effectiveOfferId, client);
    offerRow = applyBookingTimeCoPay(offerRow, booking);
    const calculated = redemptionCalculationService.calculateRedemptionAmounts(effectiveOfferId, total_bill_amount, offerRow);
    const customerWalletEzt = await tokenService.getBalance(booking.user_id, client);
    const overdraftLimit = tokenService.getOverdraftLimit();
    const effectiveEztCap = customerWalletEzt + overdraftLimit;
    const walletAffordableInr = Math.round(Math.max(0, effectiveEztCap) * EZT_TO_INR * 100) / 100;
    const standardCoPayInr = parseFloat(calculated.ezt_co_pay_amount || 0);
    const maxAllowedCoPay = Math.min(standardCoPayInr, walletAffordableInr);
    const parsedCoPayInr = parseFloat(ezt_co_pay_amount) || 0;
    const validation = redemptionCalculationService.validateCalculation(
      total_bill_amount,
      ezt_co_pay_amount,
      net_amount_from_user,
      effectiveOfferId,
      offerRow,
      { maxAllowedCoPayInr: maxAllowedCoPay }
    );
    if (parsedCoPayInr > maxAllowedCoPay + 0.01) {
      await client.query('ROLLBACK');
      throw new AppError(400, `EZT co-pay cannot exceed customer balance plus overdraft. Max applicable: ₹${maxAllowedCoPay.toFixed(2)} (${customerWalletEzt.toFixed(5)} EZT available, balance can go down to -${overdraftLimit} EZT).`);
    }
    const isOverride = (maxAllowedCoPay - parsedCoPayInr) > 0.01;
    if (isOverride && !(redemption_notes && String(redemption_notes).trim())) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'A reason is required in redemption_notes when co-pay is reduced below the customer\'s max allowed EZT amount.');
    }

    // Check if already redeemed (idempotent check)
    // CRITICAL: Use FOR UPDATE to prevent race conditions in concurrent redemption attempts
    const existingRedemption = await client.query(
      `SELECT id, redemption_status, redeemed_at, settlement_status, total_bill_amount, ezt_co_pay_amount, net_amount_from_user
       FROM redemption_audit
       WHERE booking_id = $1 AND redemption_status = 'redeemed'
       FOR UPDATE`,
      [booking.id]
    );

    if (existingRedemption.rows.length > 0) {
      await client.query('ROLLBACK');
      const redemption = existingRedemption.rows[0];
      
      // Log the duplicate redemption attempt for audit
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        redemptionId: redemption.id,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { 
          error: 'Voucher already redeemed (idempotency check)',
          redeemed_at: redemption.redeemed_at,
          settlement_status: redemption.settlement_status,
          previous_redemption_id: redemption.id
        },
        ipAddress: ipAddress,
        userAgent: userAgent
      });
      
      // Return conflict response with existing redemption details
      throw new AppError(409, `Voucher already redeemed on ${new Date(redemption.redeemed_at).toLocaleString()}. Redemption ID: ${redemption.id}`);
    }

    // Validate partner matches
    if (booking.partner_id !== partner_id) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { 
          error: 'Voucher does not belong to this partner',
          booking_partner_id: booking.partner_id,
          attempted_partner_id: partner_id
        },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(403, 'Voucher does not belong to this partner');
    }

    // Validate booking status (must be confirmed or pending, not cancelled/expired)
    // Note: This is a secondary check - primary validation is voucher_state
    if (booking.status === 'cancelled' || booking.status === 'expired') {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { 
          error: 'Booking status invalid for redemption',
          booking_status: booking.status,
          voucher_state: currentState
        },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, `Cannot redeem voucher with booking status: ${booking.status}`);
    }

    // Validate time-based rules
    const validationResult = await redemptionValidationService.validateRedemptionRules({
      bookingId: booking.id,
      partnerId: partner_id,
      offerId: booking.offer_id,
      redemptionDate: new Date(),
      redemptionTime: booking.booking_time,
      executor: client
    });

    if (!validationResult.valid) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { 
          error: 'Redemption rule validation failed',
          validation_errors: validationResult.errors
        },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, `Redemption not allowed: ${validationResult.errors.map(e => e.message).join('; ')}`);
    }

    // Validate validity window
    if (!redemptionValidationService.validateValidityWindow(booking, new Date())) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { error: 'Voucher expired' },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, 'Voucher has expired');
    }

    // Transition state: active → redeemed (partner redeem is final)
    await voucherStateMachine.transitionState({
      bookingId: booking.id,
      voucherCode: voucher_code,
      fromState: currentState,
      toState: targetState,
      actorId: actorId,
      actorRole: actorRole,
      reasonCode: 'redemption',
      reasonText: 'Voucher redeemed by partner',
      metadata: { total_bill_amount, ezt_co_pay_amount, net_amount_from_user },
      executor: client
    });

    await client.query(
      `UPDATE bookings SET status = 'redeemed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [booking.id]
    );

    // Geo-verification: 100m radius (redemption overhaul)
    const GEO_RADIUS_KM = 0.1;
    let geo_verified = false;
    if (redemption_latitude != null && redemption_longitude != null) {
      const partnerLoc = await client.query(
        'SELECT latitude, longitude FROM partners WHERE id = $1',
        [partner_id]
      );
      const p = partnerLoc.rows[0];
      if (p && p.latitude != null && p.longitude != null) {
        const km = haversineKm(
          Number(p.latitude),
          Number(p.longitude),
          Number(redemption_latitude),
          Number(redemption_longitude)
        );
        geo_verified = km <= GEO_RADIUS_KM;
      }
    }

    const metadataJson = JSON.stringify({
      booking_reference: booking.booking_reference,
      original_total_price: booking.total_price,
      original_fiat_amount: booking.fiat_amount,
      redeemed_at: new Date().toISOString(),
      validation_warnings: validationResult.warnings,
      calculation_variance: validation.valid ? null : validation.variance,
      calculated: validation.calculated,
      co_pay_override: isOverride,
      standard_co_pay: standardCoPayInr,
      standard_co_pay_inr: standardCoPayInr,
      customer_wallet_at_redemption: customerWalletEzt,
      customer_wallet_ezt_at_redemption: customerWalletEzt,
      customer_wallet_inr_at_redemption: walletAffordableInr,
      override_reason: isOverride ? (redemption_notes ? String(redemption_notes).trim() : null) : null
    });
    const disputeWindowExpiresAt = new Date(Date.now() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);
    // Round to 2 decimals so stored total matches partner-entered value (no float drift / .98 artifact).
    // Derive net from total - ezt so DB CHECK (net = total_bill - ezt_co_pay) always passes.
    const totalBillRounded = Math.round((parseFloat(total_bill_amount) || 0) * 100) / 100;
    const eztRounded = Math.round((parseFloat(ezt_co_pay_amount) || 0) * 100) / 100;
    const netRounded = Math.round((totalBillRounded - eztRounded) * 100) / 100;
    const baseParams = [
      booking.id,
      voucher_code,
      partner_id,
      totalBillRounded,
      eztRounded,
      netRounded,
      redeemed_by_user_id,
      redemption_notes,
      'redeemed',
      metadataJson
    ];
    let redemptionResult;
    try {
      redemptionResult = await client.query(
        `INSERT INTO redemption_audit (
          booking_id, voucher_code, redeemed_by_partner_id,
          total_bill_amount, ezt_co_pay_amount, net_amount_from_user,
          redeemed_by_user_id, redemption_notes, redemption_status, settlement_status, metadata,
          redemption_latitude, redemption_longitude, geo_verified,
          visit_session_id, offer_discount_percentage, discount_amount, ezt_tokens_required,
          customer_confirmation_status, confirmation_expires_at, dispute_window_expires_at
        ) VALUES ($1, $2, $3, $4::DECIMAL(12, 2), $5::DECIMAL(12, 2), $6::DECIMAL(12, 2), $7, $8, $9, 'pending', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *`,
        [
          ...baseParams,
          redemption_latitude,
          redemption_longitude,
          geo_verified,
          booking.visit_session_id || null,
          calculated.co_pay_percentage,
          calculated.discount_amount,
          calculated.ezt_tokens_required,
          null,
          null,
          disputeWindowExpiresAt,
        ]
      );
    } catch (insertErr) {
      const code = insertErr.code;
      const msg = insertErr.message || '';
      if (code === '23505' || /unique constraint|duplicate key/i.test(msg)) {
        await client.query('ROLLBACK');
        throw new AppError(409, `Voucher already redeemed. A redemption record already exists for this booking.`);
      }
      const isDisputeWindowColumnMissing = msg.includes('dispute_window_expires_at');
      const isColumnMissing = msg.includes('redemption_latitude') || msg.includes('visit_session_id') || msg.includes('offer_discount_percentage');
      const isStatusConstraint = msg.includes('redemption_status') || (msg.includes('check') && msg.includes('constraint'));
      if (isStatusConstraint && DUAL_CONFIRMATION_ENABLED) {
        await client.query('ROLLBACK');
        throw new AppError(503, 'Redemption database migration required. Please run backend/db/migrations/2026-02-redemption-overhaul.sql to support dual confirmation.');
      }
      if (isDisputeWindowColumnMissing) {
        redemptionResult = await client.query(
          `INSERT INTO redemption_audit (
            booking_id, voucher_code, redeemed_by_partner_id,
            total_bill_amount, ezt_co_pay_amount, net_amount_from_user,
            redeemed_by_user_id, redemption_notes, redemption_status, settlement_status, metadata,
            redemption_latitude, redemption_longitude, geo_verified,
            visit_session_id, offer_discount_percentage, discount_amount, ezt_tokens_required,
            customer_confirmation_status, confirmation_expires_at
          ) VALUES ($1, $2, $3, $4::DECIMAL(12, 2), $5::DECIMAL(12, 2), $6::DECIMAL(12, 2), $7, $8, $9, 'pending', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING *`,
          [
            ...baseParams,
            redemption_latitude,
            redemption_longitude,
            geo_verified,
            booking.visit_session_id || null,
            calculated.co_pay_percentage,
            calculated.discount_amount,
            calculated.ezt_tokens_required,
            null,
            null,
          ]
        );
      } else if (isColumnMissing) {
        if (DUAL_CONFIRMATION_ENABLED) {
          await client.query('ROLLBACK');
          throw new AppError(503, 'Redemption database migration required. Run backend/db/migrations/2026-02-redemption-overhaul.sql to support dual confirmation (customer must confirm before voucher shows as redeemed).');
        }
        const legacyParams = [...baseParams];
        legacyParams[8] = 'redeemed';
        redemptionResult = await client.query(
          `INSERT INTO redemption_audit (
            booking_id, voucher_code, redeemed_by_partner_id,
            total_bill_amount, ezt_co_pay_amount, net_amount_from_user,
            redeemed_by_user_id, redemption_notes, redemption_status, settlement_status, metadata,
            redemption_latitude, redemption_longitude, geo_verified
          ) VALUES ($1, $2, $3, $4::DECIMAL(12, 2), $5::DECIMAL(12, 2), $6::DECIMAL(12, 2), $7, $8, $9, 'pending', $10, $11, $12, $13)
          RETURNING *`,
          [...legacyParams, redemption_latitude, redemption_longitude, geo_verified]
        );
      } else {
        throw insertErr;
      }
    }

    const redemption = redemptionResult.rows[0];

    // Co-pay by EZT: debit from user's EZT balance (Fiat Spent = Total Bill − this co-pay; loyalty is % of Fiat Spent, credited later)
    const eztToDeduct = parseFloat((parsedCoPayInr / EZT_TO_INR).toFixed(5));
    if (eztToDeduct > 0) {
      try {
        await tokenService.redeemTokens(
          booking.user_id,
          eztToDeduct,
          null,
          `Voucher redemption (Booking ${booking.booking_reference})`,
          client
        );
      } catch (tokenErr) {
        await client.query('ROLLBACK');
        throw new AppError(400, `EZT deduction failed. ${tokenErr.message}`);
      }
    }

    // Log successful redemption
    await voucherAuditService.logAuditEvent({
      bookingId: booking.id,
      voucherCode: voucher_code,
      redemptionId: redemption.id,
      action: 'redemption_success',
      actorId: actorId,
      actorRole: actorRole,
      requestData: {
        voucher_code,
        partner_id,
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user
      },
      responseData: {
        redemption_id: redemption.id,
        settlement_status: 'pending'
      },
      ipAddress: ipAddress,
      userAgent: userAgent,
      executor: client
    });

    await voucherAuditService.logAuditEvent({
      bookingId: booking.id,
      voucherCode: voucher_code,
      redemptionId: redemption.id,
      action: 'financial_capture',
      actorId: actorId,
      actorRole: actorRole,
      requestData: { total_bill_amount, ezt_co_pay_amount, net_amount_from_user },
      executor: client
    });

    // Platform earnings ledger (dynamic tier fees) — same transaction, real-time, deterministic
    // Business rule: Platform Fee = (Fiat received by partner) × (Platform %). That fee is split for reporting:
    // Fiat % and EZT % of the fiat amount → when equal (e.g. 2.5% + 2.5% = 5%), the two amounts are equal.
    const round2 = (v) => Math.round(Number(v) * 100) / 100;
    try {
      const partnerRow = await client.query('SELECT tier_id FROM partners WHERE id = $1', [partner_id]);
      const tierId = partnerRow.rows[0]?.tier_id;
      if (tierId) {
        const tier = await partnerTierRepository.getTierForRedemption(tierId, client);
        if (tier) {
          const fiatReceived = parseFloat(net_amount_from_user) || 0; // Cash/card only; fee base is fiat only
          const platformPct = Number(tier.platform_fee_percent) || 0;
          const fiatFeePct = Number(tier.fiat_fee_percent) ?? 0;
          const eztFeePct = Number(tier.ezt_fee_percent) ?? 0;
          const platform_fee_total = round2(fiatReceived * platformPct / 100);
          const fiat_component = round2(fiatReceived * fiatFeePct / 100); // e.g. 2.5% of fiat
          const ezt_component = round2(fiatReceived * eztFeePct / 100);   // e.g. 2.5% of fiat → equal to fiat_component
          const bill_amount = round2(parseFloat(total_bill_amount) || 0);
          await partnerTierRepository.insertLedgerEntry({
            partner_id,
            tier_id: tier.id,
            tier_name: tier.name,
            tier_percentage: platformPct,
            booking_id: booking.id,
            redemption_id: redemption.id,
            bill_amount,
            platform_fee_total,
            fiat_component,
            ezt_component
          }, client);
        }
      }
    } catch (ledgerErr) {
      logError('Platform earnings ledger insert failed (fatal for atomicity):', ledgerErr.message);
      throw ledgerErr; // Rollback entire transaction so redemption + ledger + wallet stay consistent
    }

    // ====================================================================
    // Tier & Loyalty at Redemption (order: co-pay already debited above)
    // ====================================================================
    // Rules: Fiat Spent = Total Bill − Co-pay. Loyalty EZT = (fiat_spent × tier_pct) / 1000 (e.g. 1% of ₹2800 = 2.8 EZT).
    // Loyalty EZT is credited here; co-pay EZT was debited from balance earlier in this flow.
    //
    // CRITICAL: Idempotent — skip if already processed (ezt_earned IS NOT NULL).
    
    // Idempotency: skip tier if already processed (ezt_earned IS NOT NULL; do not use > 0 so ₹0 bills are idempotent)
    const existingTierProcessing = await client.query(
      `SELECT ezt_earned, user_tier_at_booking 
       FROM bookings 
       WHERE id = $1 AND ezt_earned IS NOT NULL`,
      [booking.id]
    );
    
    let tierResult = null;
    let eztEarned = 0;
    let pointsEarned = 0;
    const fiatAmount = parseFloat(net_amount_from_user) || 0;
    
    if (existingTierProcessing.rows.length === 0) {
      // Tier processing not done yet - process using fiat amount (amount paid in cash, excluding EZT co-pay)
      const tierAmount = fiatAmount;
      
      if (tierAmount > 0) {
        try {
          // Process tier rewards and check for tier upgrade (based on fiat spent)
          tierResult = await tierService.processBookingWithTier(booking.user_id, tierAmount, client);
          eztEarned = tierResult.eztEarned;
          const rewardMultiplier = booking.reward_multiplier != null ? Math.max(0.1, Math.min(5, Number(booking.reward_multiplier))) : 1;
          if (rewardMultiplier !== 1 && eztEarned > 0) {
            eztEarned = parseFloat((eztEarned * rewardMultiplier).toFixed(5));
            log(`✅ Campaign reward_multiplier applied at redemption: ${rewardMultiplier}x → EZT ${eztEarned}`);
          }
          
          // Update booking with tier information (within transaction)
          const bookingRepository = require('../repositories/bookingRepository');
          await bookingRepository.updateBookingTierInfo(booking.id, {
            ezt_earned: eztEarned,
            ezt_reward_percentage: tierResult.rewardPercentage,
            user_tier_at_booking: tierResult.tierAtBooking
          }, client);
          
          log(`✅ Tier processing at redemption for booking ${booking.id}: EZT=${eztEarned}, Tier=${tierResult.tierAtBooking}, Upgrade=${tierResult.tierUpgrade ? `${tierResult.tierUpgrade.from}→${tierResult.tierUpgrade.to}` : 'none'}`);
          
          // If tier was upgraded, log it
          if (tierResult.tierUpgrade && tierResult.tierUpgrade.upgraded) {
            log(`🎉 User ${booking.user_id} upgraded from ${tierResult.tierUpgrade.from} to ${tierResult.tierUpgrade.to} tier!`);
          }
          
          // Credit loyalty EZT (precomputed from fiat paid × tier % × multiplier); idempotent by booking.id
          if (eztEarned > 0) {
            await tokenService.creditEarned(booking.user_id, eztEarned, booking.id, `Earned from voucher redemption (Fiat paid: ₹${fiatAmount})`, client);
          }
          
          // Calculate and award loyalty points based on fiat amount paid
          const earningPreview = await loyaltyEngine.calculateEarning(booking.user_id, fiatAmount);
          pointsEarned = earningPreview.points;
          
          const loyaltyMetadata = { 
            booking_reference: booking.booking_reference,
            redemption_id: redemption.id,
            total_bill_amount: total_bill_amount,
            net_amount_from_user: net_amount_from_user
          };
          
          const loyaltyResult = await loyaltyEngine.recordActivity({
            userId: booking.user_id,
            source: 'redemption',
            referenceId: booking.id,
            amount: fiatAmount,  // Loyalty on fiat paid only (total_bill - ezt_co_pay)
            pointsEarned,
            description: `Points earned from voucher redemption (Fiat paid: ₹${fiatAmount})`,
            metadata: loyaltyMetadata,
            executor: client  // CRITICAL: Pass transaction client for atomicity
          });
          
          log(`✅ Loyalty points awarded at redemption: ${pointsEarned} points (Fiat paid: ₹${fiatAmount})`);
          
          // Log tier processing in audit
          await voucherAuditService.logAuditEvent({
            bookingId: booking.id,
            voucherCode: voucher_code,
            redemptionId: redemption.id,
            action: 'tier_processing',
            actorId: actorId,
            actorRole: 'system',
            requestData: {
              total_bill_amount,
              net_amount_from_user: fiatAmount,
              tier_amount: tierAmount
            },
            responseData: {
              ezt_earned: eztEarned,
              tier_at_redemption: tierResult.tierAtBooking,
              tier_upgrade: tierResult.tierUpgrade,
              points_earned: pointsEarned
            },
            executor: client
          });
        } catch (tierError) {
          // Log error but don't fail redemption - tier processing is important but not critical
          logError('⚠️ Tier processing error at redemption (redemption succeeded):', tierError);
          await voucherAuditService.logAuditEvent({
            bookingId: booking.id,
            voucherCode: voucher_code,
            redemptionId: redemption.id,
            action: 'tier_processing_failure',
            actorId: actorId,
            actorRole: 'system',
            errorData: {
              error: tierError.message,
              total_bill_amount
            },
            executor: client
          });
        }
      } else {
        log(`⚠️ Skipping tier processing when fiat paid = 0, booking ${booking.id}`);
      }

      // EZ Club: cross-network check-in count and qualification (idempotent per redemption)
      try {
        await client.query(
          `UPDATE users SET
            ez_club_network_check_ins = COALESCE(ez_club_network_check_ins, 0) + 1,
            ez_club_member = ((COALESCE(ez_club_network_check_ins, 0) + 1) >= 5) OR COALESCE(ez_club_member, false),
            ez_club_qualified_at = CASE WHEN ((COALESCE(ez_club_network_check_ins, 0) + 1) >= 5) AND ez_club_qualified_at IS NULL THEN CURRENT_TIMESTAMP ELSE ez_club_qualified_at END
           WHERE id = $1`,
          [booking.user_id]
        );
      } catch (ezClubErr) {
        if (ezClubErr.code !== '42703' && !String(ezClubErr.message || '').includes('ez_club')) {
          logError('⚠️ EZ Club update error (non-fatal):', ezClubErr);
        }
      }
    } else {
      // Tier processing already done - log for audit
      log(`ℹ️ Tier processing already completed for booking ${booking.id} (idempotency check passed)`);
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        redemptionId: redemption.id,
        action: 'tier_processing_skipped',
        actorId: actorId,
        actorRole: 'system',
        requestData: {
          reason: 'Already processed',
          existing_ezt_earned: existingTierProcessing.rows[0].ezt_earned
        },
        executor: client
      });
    }

    await client.query('COMMIT');

    // Notify customer so chat header / ecosystem summary can refetch (tier, EZT, visits, spend updated)
    emitToRoom(`users:${booking.user_id}`, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason: 'offer_redeemed' });

    // Award venue membership card on first redemption (Phase 3 #17 – NFT-style membership cards)
    try {
      const membershipCardRepository = require('../repositories/membershipCardRepository');
      await membershipCardRepository.addCard({ userId: booking.user_id, partnerId: booking.partner_id });
    } catch (cardErr) {
      logError('Membership card award (non-fatal):', cardErr);
    }

    // Get partner and user details for notifications
    const [partnerResult, userResult, adminResult] = await Promise.all([
      pool.query(`SELECT id, name, email FROM partners WHERE id = $1`, [partner_id]),
      pool.query(`SELECT id, first_name, last_name, phone_number, email FROM users WHERE id = $1`, [booking.user_id]),
      pool.query(`
        SELECT u.id, u.email
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.role_name = 'admin' OR r.role_name = 'super_admin'
        LIMIT 10
      `)
    ]);

    const partner = partnerResult.rows[0];
    const user = userResult.rows[0];
    const admins = adminResult.rows;

    // Send notifications (non-blocking)
    try {
      const notificationService = require('./notificationService');

      // Notify user: redemption happened; they can open booking to dispute if needed
      const eztAppliedInr = parsedCoPayInr;
      const shortfallInr = Math.round((maxApplicableInr - eztAppliedInr) * 100) / 100;
      const dealTitle = (await pool.query(`SELECT title FROM partner_offers WHERE id = (SELECT deal_id FROM bookings WHERE id = $1)`, [booking.id])).rows[0]?.title;
      let userMessage = `Your voucher for ${dealTitle || 'this deal'} at ${partner?.name || 'the venue'} was redeemed.`;
      if (eztAppliedInr > 0) {
        userMessage += ` ₹${eztAppliedInr.toFixed(2)} EZT was applied to your bill.`;
        if (shortfallInr > 0.01) {
          userMessage += ` (₹${shortfallInr.toFixed(2)} of your balance was not used.)`;
        }
      }
      userMessage += ` If this wasn't you or something went wrong, you can dispute from the booking within ${DISPUTE_WINDOW_HOURS} hours.`;
      await notificationService.create({
        userId: booking.user_id,
        type: 'voucher_redeemed',
        title: 'Voucher Redeemed',
        message: userMessage,
        actionUrl: `/bookings/${booking.id}`,
        actionLabel: 'View & dispute if needed',
        priority: 'normal',
        metadata: {
          booking_id: booking.id,
          voucher_code: voucher_code,
          partner_id: partner_id,
          partner_name: partner?.name,
          redemption_id: redemption.id,
          total_bill_amount: total_bill_amount,
          ezt_co_pay_amount: ezt_co_pay_amount,
          net_amount_from_user: net_amount_from_user,
          settlement_status: 'pending',
          customer_wallet_ezt_at_redemption: customerWalletEzt,
          ezt_applied_inr: eztAppliedInr
        }
      });

      // Notify partner
      if (partner) {
        const partnerUserResult = await pool.query(
          `SELECT id FROM users WHERE email = $1 LIMIT 1`,
          [partner.email]
        );
        if (partnerUserResult.rows.length > 0) {
          await notificationService.create({
            userId: partnerUserResult.rows[0].id,
            type: 'voucher_redeemed',
            title: 'Voucher Redeemed',
            message: `Voucher ${booking.booking_reference} redeemed. Bill: ₹${total_bill_amount}, EZT: ₹${ezt_co_pay_amount}, Net: ₹${net_amount_from_user}`,
            actionUrl: `/partner/bookings/${booking.id}`,
            actionLabel: 'View Booking',
            priority: 'normal',
            metadata: {
              booking_id: booking.id,
              voucher_code: voucher_code,
              redemption_id: redemption.id,
              settlement_status: 'pending'
            }
          });
        }
      }

      // Notify admins
      if (admins.length > 0) {
        const adminUserIds = admins.map(a => a.id);
        await notificationService.createBulk(adminUserIds, {
          type: 'voucher_redeemed',
          title: 'Voucher Redemption',
          message: `Voucher ${booking.booking_reference} redeemed at ${partner?.name || 'partner'}. Bill: ₹${total_bill_amount}`,
          actionUrl: `/admin/bookings/${booking.id}`,
          actionLabel: 'View Booking',
          priority: 'normal',
          metadata: {
            booking_id: booking.id,
            voucher_code: voucher_code,
            partner_id: partner_id,
            redemption_id: redemption.id,
            settlement_status: 'pending'
          }
        });
      }

      log(`✅ Notifications sent for redemption ${redemption.id}`);
    } catch (notifError) {
      logError('⚠️ Notification error (redemption succeeded):', notifError);
    }

    log(`✅ Voucher ${voucher_code} redeemed successfully. Redemption ID: ${redemption.id}, Settlement: pending`);

    return {
      ...redemption,
      booking: {
        id: booking.id,
        booking_reference: booking.booking_reference,
        user_id: booking.user_id,
        partner_id: booking.partner_id
      },
      partner: partner ? { id: partner.id, name: partner.name } : null,
      user: user ? { id: user.id, name: `${user.first_name} ${user.last_name}` } : null,
      state_transition: {
        from: currentState,
        to: 'redeemed'
      }
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logError('Rollback error:', rollbackErr.message);
    }
    try {
      const ctx = context || {};
      await voucherAuditService.logAuditEvent({
        voucherCode: redemptionData?.voucher_code,
        action: 'redemption_failure',
        actorId: ctx.actorId || redemptionData?.partner_id,
        actorRole: ctx.actorRole || 'partner',
        errorData: {
          error: error.message,
          stack: error.stack
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        executor: client
      });
    } catch (auditErr) {
      logError('Audit log error:', auditErr.message);
    }

    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Enhanced redemption error:', error);
    throw new AppError(500, `Redemption failed: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Build API response shape for a redemption by id (for idempotency key replay).
 * Same shape as redeemVoucherEnhanced return. Does not modify state.
 */
async function getRedemptionResponseById(redemptionId) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT ra.id, ra.booking_id, ra.voucher_code, ra.redeemed_by_partner_id, ra.redeemed_at, ra.redemption_status,
            ra.total_bill_amount, ra.ezt_co_pay_amount, ra.net_amount_from_user, ra.redemption_notes, ra.metadata, ra.created_at,
            b.id AS b_id, b.booking_reference, b.user_id AS b_user_id, b.partner_id AS b_partner_id,
            p.id AS p_id, p.name AS p_name, u.id AS u_id, u.first_name, u.last_name
     FROM redemption_audit ra
     JOIN bookings b ON b.id = ra.booking_id
     LEFT JOIN partners p ON p.id = ra.redeemed_by_partner_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ra.id = $1 AND ra.redemption_status = 'redeemed'`,
    [redemptionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const redemption = {
    id: row.id,
    booking_id: row.booking_id,
    voucher_code: row.voucher_code,
    redeemed_by_partner_id: row.redeemed_by_partner_id,
    redeemed_at: row.redeemed_at,
    redemption_status: row.redemption_status,
    total_bill_amount: row.total_bill_amount,
    ezt_co_pay_amount: row.ezt_co_pay_amount,
    net_amount_from_user: row.net_amount_from_user,
    redemption_notes: row.redemption_notes,
    metadata: row.metadata,
    created_at: row.created_at
  };
  return {
    ...redemption,
    booking: {
      id: row.b_id,
      booking_reference: row.booking_reference,
      user_id: row.b_user_id,
      partner_id: row.b_partner_id
    },
    partner: row.p_id ? { id: row.p_id, name: row.p_name } : null,
    user: row.u_id ? { id: row.u_id, name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'User' } : null,
    state_transition: { from: 'pending', to: 'redeemed' }
  };
}

module.exports = {
  redeemVoucherEnhanced,
  getRedemptionResponseById
};
