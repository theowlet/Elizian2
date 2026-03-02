const cron = require('node-cron');
const { getPool } = require('../config/db');
const { log, logError } = require('../utils/logger');
const slotCapacityService = require('../services/slotCapacityService');
const waitlistService = require('../services/waitlistService');
const tokenService = require('../services/tokenService');

const pool = getPool();

// Auto-cancel pending bookings after 10 minutes
function startBookingAutoCancelJob() {
  if (process.env.VERCEL) {
    log('⏸️ Auto-cancel bookings cron disabled on Vercel');
    return;
  }

  cron.schedule('*/5 * * * *', async () => { // Run every 5 minutes
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // FIX #2: Include partner_id, booking_date, booking_time in RETURNING
      // (slot_id was never set by createBooking, so the old release code was dead)
      const result = await pool.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = 'Auto-cancelled: No confirmation within 10 minutes'
         WHERE status = 'pending'
         AND created_at < $1
         RETURNING id, deal_id, partner_id, booking_date, booking_time, num_tickets`,
        [tenMinutesAgo]
      );

      if (result.rows.length > 0) {
        log(`🔄 Auto-cancelled ${result.rows.length} pending bookings`);

        // FIX #2: Release slots using proper service methods instead of broken slot_id approach
        for (const booking of result.rows) {
          const partySize = booking.num_tickets || 1;
          // Release deal_slots capacity
          if (booking.deal_id && booking.booking_date) {
            try {
              await slotCapacityService.releaseDealSlotStandalone(
                booking.deal_id, booking.booking_date, booking.booking_time, partySize
              );
            } catch (e) {
              logError(`⚠️ Failed to release deal slot for auto-cancelled booking ${booking.id}:`, e);
            }
          }
          // Release venue_time_slots capacity
          if (booking.partner_id && booking.booking_date && booking.booking_time) {
            try {
              const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
              if (slotDt) {
                await slotCapacityService.releaseSlotStandalone(booking.partner_id, slotDt, partySize);
              }
            } catch (e) {
              logError(`⚠️ Failed to release venue slot for auto-cancelled booking ${booking.id}:`, e);
            }
          }
          // FIFO: Promote or notify next waitlist user when slot opens
          if (booking.partner_id && booking.booking_date && booking.booking_time) {
            const dateStr = (slotCapacityService.toDateString && slotCapacityService.toDateString(booking.booking_date)) || String(booking.booking_date).trim().substring(0, 10);
            const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
            if (dateStr && timeStr) {
              const promote = booking.deal_id
                ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
                : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
              promote
                .then((result) => {
                  if (result) {
                    if (result.booking) log(`🔔 FIFO waitlist: promoted user ${result.waitlistEntry?.user_id} to confirmed booking for auto-cancelled slot ${dateStr} ${timeStr}`);
                    else log(`🔔 FIFO waitlist: notified user ${result.user_id} for auto-cancelled slot ${dateStr} ${timeStr}`);
                  }
                })
                .catch((err) => logError('⚠️ Waitlist promote/notify failed (non-fatal):', err));
            }
          }
        }
      }
      // ====================================================================
      // EVENT PAYMENT EXPIRY: Auto-expire payment_pending bookings past deadline
      // ====================================================================
      try {
        const expiryResult = await pool.query(
          `UPDATE bookings
           SET status = 'expired',
               expired_at = CURRENT_TIMESTAMP,
               cancelled_by = 'system',
               cancellation_reason = 'Auto-expired: Payment deadline passed'
           WHERE status = 'payment_pending'
           AND payment_deadline IS NOT NULL
           AND payment_deadline < CURRENT_TIMESTAMP
           RETURNING id, deal_id, partner_id, booking_date, booking_time, num_tickets, user_id, voucher_code`
        );

        if (expiryResult.rows.length > 0) {
          log(`⏰ Auto-expired ${expiryResult.rows.length} payment_pending bookings (deadline passed)`);

          for (const booking of expiryResult.rows) {
            const partySize = booking.num_tickets || 1;

            // Transition voucher: booked → cancelled
            try {
              const voucherStateMachine = require('../services/voucherStateMachine');
              await voucherStateMachine.transitionState({
                bookingId: booking.id,
                voucherCode: booking.voucher_code,
                fromState: 'booked',
                toState: 'cancelled',
                actorId: null,
                actorRole: 'system',
                reasonCode: 'payment_deadline_expired',
                reasonText: 'Auto-expired: payment deadline passed'
              });
            } catch (vErr) {
              logError(`⚠️ Voucher transition failed for expired booking ${booking.id} — attempting direct fallback:`, vErr);
              // Fallback: update voucher_state directly so expired bookings don't show stale voucher_state
              try {
                await pool.query(
                  `UPDATE bookings SET voucher_state = 'cancelled' WHERE id = $1 AND voucher_state = 'booked'`,
                  [booking.id]
                );
              } catch (fbErr) {
                logError(`⚠️ Fallback voucher_state update also failed for booking ${booking.id}:`, fbErr);
              }
            }

            // Release deal_slots capacity
            if (booking.deal_id && booking.booking_date) {
              try {
                await slotCapacityService.releaseDealSlotStandalone(
                  booking.deal_id, booking.booking_date, booking.booking_time, partySize
                );
              } catch (e) {
                logError(`⚠️ Failed to release deal slot for expired booking ${booking.id}:`, e);
              }
            }

            // Release venue_time_slots capacity
            if (booking.partner_id && booking.booking_date && booking.booking_time) {
              try {
                const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
                if (slotDt) {
                  await slotCapacityService.releaseSlotStandalone(booking.partner_id, slotDt, partySize);
                }
              } catch (e) {
                logError(`⚠️ Failed to release venue slot for expired booking ${booking.id}:`, e);
              }
            }

            // FIFO: Promote next waitlist user
            if (booking.partner_id && booking.booking_date && booking.booking_time) {
              const dateStr = (slotCapacityService.toDateString && slotCapacityService.toDateString(booking.booking_date)) || String(booking.booking_date).trim().substring(0, 10);
              const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
              if (dateStr && timeStr) {
                const promote = booking.deal_id
                  ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
                  : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
                promote
                  .then((promoteResult) => {
                    if (promoteResult) {
                      if (promoteResult.booking) log(`🔔 FIFO waitlist: promoted user ${promoteResult.waitlistEntry?.user_id} for expired-payment slot ${dateStr} ${timeStr}`);
                      else log(`🔔 FIFO waitlist: notified user ${promoteResult.user_id} for expired-payment slot ${dateStr} ${timeStr}`);
                    }
                  })
                  .catch((err) => logError('⚠️ Waitlist promote/notify failed for expired booking (non-fatal):', err));
              }
            }

            // Notify user that their booking expired
            try {
              const notificationService = require('../services/notificationService');
              await notificationService.create({
                userId: booking.user_id,
                type: 'event_booking_expired',
                title: 'Booking Expired — Payment Deadline Passed',
                message: `Your event booking has expired because payment was not confirmed before the deadline. You can try booking again if slots are available.`,
                actionUrl: `/bookings/${booking.id}`,
                priority: 'high',
                metadata: { booking_id: booking.id },
                sentViaInApp: true,
                sentViaPush: true,
              });
            } catch (notifErr) {
              logError(`⚠️ Expiry notification failed for booking ${booking.id} (non-fatal):`, notifErr);
            }
          }
        }
      } catch (expiryError) {
        logError('❌ Error in payment_pending expiry block:', expiryError);
      }

      // ═══════════════════════════════════════════════════════════
      // INVENTORY RESERVATION EXPIRY: temp_reserved past dynamic window
      // ═══════════════════════════════════════════════════════════
      try {
        const inventoryResult = await pool.query(
          `UPDATE bookings
           SET status = 'expired',
               expired_at = CURRENT_TIMESTAMP,
               cancelled_by = 'system',
               cancellation_reason = 'Auto-expired: Reservation window closed'
           WHERE status = 'temp_reserved'
           AND reservation_expires_at IS NOT NULL
           AND reservation_expires_at < CURRENT_TIMESTAMP
           RETURNING id, deal_id, partner_id, booking_date, booking_time,
                     num_tickets, user_id, voucher_code`
        );

        if (inventoryResult.rows.length > 0) {
          log(`⏰ INVENTORY auto-expired ${inventoryResult.rows.length} temp_reserved bookings`);

          for (const booking of inventoryResult.rows) {
            const partySize = booking.num_tickets || 1;

            // 1. Release token lock
            try {
              await tokenService.releaseTokenLock(booking.id, 'timeout');
            } catch (lockErr) {
              logError(`⚠️ Failed to release token lock for expired INVENTORY booking ${booking.id}:`, lockErr);
            }

            // 2. Voucher: booked → cancelled
            try {
              const voucherStateMachine = require('../services/voucherStateMachine');
              await voucherStateMachine.transitionState({
                bookingId: booking.id,
                voucherCode: booking.voucher_code,
                fromState: 'booked',
                toState: 'cancelled',
                actorId: null,
                actorRole: 'system',
                reasonCode: 'inventory_reservation_expired',
                reasonText: 'Auto-expired: reservation window closed'
              });
            } catch (vErr) {
              logError(`⚠️ Voucher transition failed for expired INVENTORY booking ${booking.id}:`, vErr);
              try {
                await pool.query(
                  `UPDATE bookings SET voucher_state = 'cancelled' WHERE id = $1 AND voucher_state = 'booked'`,
                  [booking.id]
                );
              } catch (fbErr) {
                logError(`⚠️ Fallback voucher_state update also failed for INVENTORY booking ${booking.id}:`, fbErr);
              }
            }

            // 3. Release deal_slots capacity
            if (booking.deal_id && booking.booking_date) {
              try {
                await slotCapacityService.releaseDealSlotStandalone(
                  booking.deal_id, booking.booking_date, booking.booking_time, partySize
                );
              } catch (e) {
                logError(`⚠️ Failed to release deal slot for expired INVENTORY booking ${booking.id}:`, e);
              }
            }

            // 4. Release venue_time_slots capacity
            if (booking.partner_id && booking.booking_date && booking.booking_time) {
              try {
                const slotDt = slotCapacityService.toSlotDatetime(booking.booking_date, booking.booking_time);
                if (slotDt) {
                  await slotCapacityService.releaseSlotStandalone(booking.partner_id, slotDt, partySize);
                }
              } catch (e) {
                logError(`⚠️ Failed to release venue slot for expired INVENTORY booking ${booking.id}:`, e);
              }
            }

            // 5. FIFO waitlist promotion
            if (booking.partner_id && booking.booking_date && booking.booking_time) {
              const dateStr = (slotCapacityService.toDateString && slotCapacityService.toDateString(booking.booking_date)) || String(booking.booking_date).trim().substring(0, 10);
              const timeStr = slotCapacityService.normalizeDealTimeSlot(booking.booking_time) || String(booking.booking_time || '').substring(0, 5);
              if (dateStr && timeStr) {
                const promote = booking.deal_id
                  ? waitlistService.promoteNextWaitlistToBooking(booking.partner_id, booking.deal_id, dateStr, timeStr)
                  : waitlistService.notifyNextInWaitlist(booking.partner_id, dateStr, timeStr);
                promote
                  .then((r) => {
                    if (r && r.booking) log(`🔔 FIFO: promoted user for expired INVENTORY slot ${dateStr} ${timeStr}`);
                  })
                  .catch((err) => logError('⚠️ Waitlist promote failed for INVENTORY expiry (non-fatal):', err));
              }
            }

            // 6. Notify user
            try {
              const notificationService = require('../services/notificationService');
              await notificationService.create({
                userId: booking.user_id,
                type: 'inventory_reservation_expired',
                title: 'Reservation Expired — Tokens Released',
                message: 'Your event reservation has expired. Any locked EZT tokens have been released back to your wallet. You can try booking again if slots are available.',
                actionUrl: `/bookings/${booking.id}`,
                priority: 'high',
                metadata: { booking_id: booking.id },
                sentViaInApp: true,
                sentViaPush: true,
              });
            } catch (notifErr) {
              logError(`⚠️ Expiry notification failed for INVENTORY booking ${booking.id} (non-fatal):`, notifErr);
            }
          }
        }
      } catch (inventoryError) {
        logError('❌ Error in INVENTORY temp_reserved expiry block:', inventoryError);
      }

    } catch (error) {
      logError('❌ Error in auto-cancel bookings cron job:', error);
    }
  });

  log('⏰ Auto-cancel pending + event payment expiry + INVENTORY reservation expiry: Enabled (runs every 5 minutes)');
}

module.exports = {
  startBookingAutoCancelJob
};
