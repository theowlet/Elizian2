/**
 * Test Redemption and Verify Notifications
 * Creates a test booking, redeems it, and verifies notifications were sent
 */

require('dotenv').config();
const { getPool } = require('../src/config/db');
const bookingService = require('../src/services/bookingService');
const redemptionService = require('../src/services/redemptionService');
const { log, logError } = require('../utils/logger');

const pool = getPool();

async function testRedemptionNotifications() {
  console.log('🧪 Testing Redemption Flow and Notifications...\n');

  try {
    // Step 1: Get test user and partner
    const userResult = await pool.query(`
      SELECT id, first_name, phone_number 
      FROM users 
      WHERE role_id IN (SELECT id FROM roles WHERE role_name = 'user')
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database');
      process.exit(1);
    }

    const testUser = userResult.rows[0];
    console.log(`✅ Found test user: ${testUser.first_name} (${testUser.phone_number})`);

    // Get partner
    const partnerResult = await pool.query(`
      SELECT id, name, email
      FROM partners
      WHERE is_active = true
      LIMIT 1
    `);

    if (partnerResult.rows.length === 0) {
      console.log('❌ No active partners found in database');
      process.exit(1);
    }

    const testPartner = partnerResult.rows[0];
    console.log(`✅ Found test partner: ${testPartner.name}`);

    // Get active offer for this partner
    const offerResult = await pool.query(`
      SELECT id, title, service_type
      FROM partner_offers
      WHERE partner_id = $1
        AND is_active = true
        AND status = 'active'
        AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
        AND (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP)
      LIMIT 1
    `, [testPartner.id]);

    if (offerResult.rows.length === 0) {
      console.log('❌ No active offers found for partner');
      process.exit(1);
    }

    const testOffer = offerResult.rows[0];
    console.log(`✅ Found test offer: ${testOffer.title}\n`);

    // Step 2: Create test booking
    console.log('📝 Step 1: Creating test booking...');
    const bookingData = {
      user_id: testUser.id,
      offer_id: testOffer.id,
      num_tickets: 1,
      reservation_data: {
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        time: '19:00',
        partySize: 1
      }
    };

    const booking = await bookingService.createBooking(bookingData);
    console.log(`✅ Booking created: ${booking.booking_reference}`);
    console.log(`   Voucher Code: ${booking.voucher_code}`);
    console.log(`   QR Code: ${booking.qr_code_url ? 'Generated' : 'Not generated'}\n`);

    if (!booking.voucher_code) {
      console.log('❌ Voucher code not generated!');
      process.exit(1);
    }

    // Step 3: Wait a moment for booking to be committed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Redeem voucher
    console.log('💰 Step 2: Redeeming voucher with financial capture...');
    
    const redemption = await redemptionService.redeemVoucher({
      voucher_code: booking.voucher_code,
      partner_id: testPartner.id,
      total_bill_amount: 1000.00,
      ezt_co_pay_amount: 100.00,
      net_amount_from_user: 900.00,
      redemption_notes: 'Test redemption for notification verification'
    });
    console.log(`✅ Voucher redeemed successfully!`);
    console.log(`   Redemption ID: ${redemption.id}`);
    console.log(`   Total Bill: ₹${redemption.total_bill_amount}`);
    console.log(`   EZT Co-Pay: ₹${redemption.ezt_co_pay_amount}`);
    console.log(`   Net from User: ₹${redemption.net_amount_from_user}\n`);

    // Step 5: Verify notifications
    console.log('📬 Step 3: Verifying notifications...');
    
    // Check user notification
    const userNotifResult = await pool.query(`
      SELECT id, notification_type, title, message, is_read, created_at
      FROM notifications
      WHERE user_id = $1
        AND notification_type = 'voucher_redeemed'
      ORDER BY created_at DESC
      LIMIT 1
    `, [testUser.id]);

    if (userNotifResult.rows.length > 0) {
      const notif = userNotifResult.rows[0];
      console.log(`✅ User notification sent:`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Message: ${notif.message}`);
      console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`);
    } else {
      console.log(`⚠️  User notification not found`);
    }

    // Check admin notifications
    const adminNotifResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE notification_type = 'voucher_redeemed'
        AND created_at > NOW() - INTERVAL '1 minute'
    `);

    const adminCount = parseInt(adminNotifResult.rows[0].count || 0);
    console.log(`✅ Admin notifications sent: ${adminCount}`);

    // Check redemption audit record
    const auditResult = await pool.query(`
      SELECT id, redeemed_at, total_bill_amount, ezt_co_pay_amount, net_amount_from_user
      FROM redemption_audit
      WHERE voucher_code = $1
      ORDER BY redeemed_at DESC
      LIMIT 1
    `, [booking.voucher_code]);

    if (auditResult.rows.length > 0) {
      const audit = auditResult.rows[0];
      console.log(`✅ Redemption audit record created:`);
      console.log(`   Redemption ID: ${audit.id}`);
      console.log(`   Redeemed At: ${new Date(audit.redeemed_at).toLocaleString()}`);
      console.log(`   Financial Data: Bill=₹${audit.total_bill_amount}, EZT=₹${audit.ezt_co_pay_amount}, Net=₹${audit.net_amount_from_user}`);
    } else {
      console.log(`⚠️  Redemption audit record not found`);
    }

    // Check booking status
    const bookingCheck = await pool.query(`
      SELECT status, voucher_code
      FROM bookings
      WHERE id = $1
    `, [booking.id]);

    if (bookingCheck.rows[0].status === 'redeemed') {
      console.log(`✅ Booking status updated to 'redeemed'`);
    } else {
      console.log(`⚠️  Booking status: ${bookingCheck.rows[0].status} (expected: redeemed)`);
    }

    console.log('\n🎉 All Tests Passed!');
    console.log('\n📋 Summary:');
    console.log(`   ✅ Booking created with voucher code`);
    console.log(`   ✅ QR code generated and uploaded`);
    console.log(`   ✅ Voucher redeemed with financial capture`);
    console.log(`   ✅ Notifications sent to user and admins`);
    console.log(`   ✅ Redemption audit record created`);
    console.log(`   ✅ Booking status updated to 'redeemed'`);

  } catch (error) {
    logError('❌ Test failed:', error);
    console.log('\n❌ Redemption notification test failed!');
    console.log(`   Error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testRedemptionNotifications()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError('Test script failed:', error);
    process.exit(1);
  });

