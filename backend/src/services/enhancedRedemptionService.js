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
const { AppError } = require('../../utils/response');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

/**
 * Enhanced voucher redemption with enterprise features
 * @param {Object} redemptionData - Redemption details
 * @param {Object} context - Request context (IP, user agent, actor info)
 * @returns {Object} Redemption record with settlement info
 */
async function redeemVoucherEnhanced(redemptionData, context = {}) {
  const client = await pool.connect();
  
  try {
    const {
      voucher_code,
      partner_id,
      total_bill_amount,
      ezt_co_pay_amount,
      net_amount_from_user,
      redeemed_by_user_id = null,
      redemption_notes = null
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

    await client.query('BEGIN');

    // Get booking with lock
    const bookingResult = await client.query(
      `SELECT 
        b.id, b.user_id, b.partner_id, b.deal_id, b.status, b.voucher_state,
        b.voucher_code, b.booking_reference, b.total_price, b.fiat_amount,
        b.booking_date, b.booking_time, b.expires_at, b.created_at,
        po.id as offer_id, po.end_date as offer_end_date
       FROM bookings b
       LEFT JOIN partner_offers po ON b.deal_id = po.id
       WHERE b.voucher_code = $1
       FOR UPDATE`,
      [voucher_code]
    );

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
    
    // Get transaction ID associated with this booking
    // Transaction is created at booking time, so find it by user_id, partner_id, and timestamp
    const transactionResult = await client.query(
      `SELECT id, tokens_redeemed 
       FROM transactions 
       WHERE user_id = $1 
         AND partner_id = $2 
         AND created_at >= $3 - INTERVAL '2 minutes'
         AND created_at <= $3 + INTERVAL '2 minutes'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [booking.user_id, booking.partner_id, booking.created_at]
    );
    const transaction = transactionResult.rows[0] || null;
    booking.transaction_id = transaction?.id || null;
    booking.tokens_redeemed = parseFloat(transaction?.tokens_redeemed || 0);

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
      throw new AppError(400, `Cannot redeem voucher in state '${currentState}'. Voucher must be 'active'. Current state: ${currentState}`);
    }

    // Validate state transition (double-check)
    if (!voucherStateMachine.isValidTransition(currentState, 'redeemed')) {
      await client.query('ROLLBACK');
      await voucherAuditService.logAuditEvent({
        bookingId: booking.id,
        voucherCode: voucher_code,
        action: 'redemption_failure',
        actorId: actorId,
        actorRole: actorRole,
        errorData: { 
          error: 'Invalid state transition',
          current_state: currentState,
          attempted_state: 'redeemed'
        },
        ipAddress: ipAddress,
        userAgent: userAgent,
        executor: client
      });
      throw new AppError(400, `Invalid state transition from '${currentState}' to 'redeemed'`);
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

    // Transition state: active → redeemed
    await voucherStateMachine.transitionState({
      bookingId: booking.id,
      voucherCode: voucher_code,
      fromState: currentState,
      toState: 'redeemed',
      actorId: actorId,
      actorRole: actorRole,
      reasonCode: 'redemption',
      reasonText: 'Voucher redeemed by partner',
      metadata: {
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user
      },
      executor: client
    });

    // Update booking status
    await client.query(
      `UPDATE bookings 
       SET status = 'redeemed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [booking.id]
    );

    // Create redemption audit record with settlement_status = 'pending'
    // CRITICAL: Financial fields must be properly typed (DECIMAL) and immutable after redemption
    const redemptionResult = await client.query(
      `INSERT INTO redemption_audit (
        booking_id,
        voucher_code,
        redeemed_by_partner_id,
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user,
        redeemed_by_user_id,
        redemption_notes,
        redemption_status,
        settlement_status,
        metadata
      ) VALUES ($1, $2, $3, $4::DECIMAL(12, 2), $5::DECIMAL(12, 2), $6::DECIMAL(12, 2), $7, $8, 'redeemed', 'pending', $9)
      RETURNING *`,
      [
        booking.id,
        voucher_code,
        partner_id,
        parseFloat(total_bill_amount) || 0, // Ensure numeric type
        parseFloat(ezt_co_pay_amount) || 0, // Ensure numeric type
        parseFloat(net_amount_from_user) || 0, // Ensure numeric type
        redeemed_by_user_id,
        redemption_notes,
        JSON.stringify({
          booking_reference: booking.booking_reference,
          original_total_price: booking.total_price,
          original_fiat_amount: booking.fiat_amount,
          redeemed_at: new Date().toISOString(),
          validation_warnings: validationResult.warnings
        })
      ]
    );

    const redemption = redemptionResult.rows[0];

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

    // Log financial capture
    await voucherAuditService.logAuditEvent({
      bookingId: booking.id,
      voucherCode: voucher_code,
      redemptionId: redemption.id,
      action: 'financial_capture',
      actorId: actorId,
      actorRole: actorRole,
      requestData: {
        total_bill_amount,
        ezt_co_pay_amount,
        net_amount_from_user
      },
      executor: client
    });

    // ====================================================================
    // ARCHITECTURAL FIX: Tier & Loyalty Processing at Redemption Time
    // ====================================================================
    // 
    // In voucher-based systems (Nearbuy/EazyDiner model), tier and loyalty
    // processing must occur ONLY after redemption, when the actual bill amount
    // is known. This ensures:
    // 1. Tier upgrades are based on actual spending (total_bill_amount)
    // 2. Financial accuracy with real transaction values
    // 3. Audit trail links tier processing to redemption
    //
    // CRITICAL: This must be idempotent - check if already processed
    // to prevent duplicate tier credits on retries or admin overrides.
    
    // Check if tier processing already done (idempotency check)
    const existingTierProcessing = await client.query(
      `SELECT ezt_earned, user_tier_at_booking 
       FROM bookings 
       WHERE id = $1 AND ezt_earned IS NOT NULL AND ezt_earned > 0`,
      [booking.id]
    );
    
    let tierResult = null;
    let eztEarned = 0;
    let pointsEarned = 0;
    
    if (existingTierProcessing.rows.length === 0) {
      // Tier processing not done yet - process now using actual bill amount
      const tierAmount = parseFloat(total_bill_amount) || 0;
      
      if (tierAmount > 0) {
        try {
          // Process tier rewards and check for tier upgrade
          tierResult = await tierService.processBookingWithTier(booking.user_id, tierAmount);
          eztEarned = tierResult.eztEarned;
          
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
          
          // Award EZT tokens based on tier processing
          if (eztEarned > 0) {
            await tokenService.awardTokens(booking.user_id, eztEarned, null, `Earned from voucher redemption (Bill: ₹${total_bill_amount})`);
          }
          
          // Calculate and award loyalty points based on actual bill amount
          const earningPreview = await loyaltyEngine.calculateEarning(booking.user_id, total_bill_amount);
          pointsEarned = earningPreview.points;
          
          const loyaltyMetadata = { 
            booking_reference: booking.booking_reference,
            redemption_id: redemption.id,
            total_bill_amount: total_bill_amount
          };
          
          const loyaltyResult = await loyaltyEngine.recordActivity({
            userId: booking.user_id,
            source: 'redemption',
            referenceId: booking.id,
            amount: total_bill_amount,  // Use actual bill amount from redemption
            pointsEarned,
            description: `Points earned from voucher redemption (Bill: ₹${total_bill_amount})`,
            metadata: loyaltyMetadata,
            executor: client  // CRITICAL: Pass transaction client for atomicity
          });
          
          log(`✅ Loyalty points awarded at redemption: ${pointsEarned} points (Bill: ₹${total_bill_amount})`);
          
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
        log(`⚠️ Skipping tier processing for free redemption (bill amount = 0), booking ${booking.id}`);
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

      // Notify user
      await notificationService.create({
        userId: booking.user_id,
        type: 'voucher_redeemed',
        title: 'Voucher Redeemed',
        message: `Your voucher ${booking.booking_reference} has been redeemed at ${partner?.name || 'partner'}.`,
        actionUrl: `/bookings/${booking.id}`,
        actionLabel: 'View Booking',
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
          settlement_status: 'pending'
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
    await client.query('ROLLBACK');
    
    // Log error
    await voucherAuditService.logAuditEvent({
      voucherCode: redemptionData.voucher_code,
      action: 'redemption_failure',
      actorId: context.actorId || redemptionData.partner_id,
      actorRole: context.actorRole || 'partner',
      errorData: {
        error: error.message,
        stack: error.stack
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    if (error instanceof AppError) {
      throw error;
    }
    logError('❌ Enhanced redemption error:', error);
    throw new AppError(500, `Redemption failed: ${error.message}`);
  } finally {
    client.release();
  }
}

module.exports = {
  redeemVoucherEnhanced
};

