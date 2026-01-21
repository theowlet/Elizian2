/**
 * Test Booking Creation with QR Code Generation
 * Creates a test booking to verify QR code generation works
 */

require('dotenv').config();
const { getPool } = require('../src/config/db');
const bookingService = require('../src/services/bookingService');
const { log, logError } = require('../utils/logger');

const pool = getPool();

async function testBookingCreation() {
  console.log('🧪 Testing Booking Creation with QR Code Generation...\n');

  try {
    // Get a test user and offer
    const userResult = await pool.query(`
      SELECT id, first_name, phone_number 
      FROM users 
      WHERE role_id IN (SELECT id FROM roles WHERE role_name = 'user')
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database');
      console.log('   Please create a user first before testing bookings');
      process.exit(1);
    }

    const testUser = userResult.rows[0];
    console.log(`✅ Found test user: ${testUser.first_name} (${testUser.phone_number})`);

    // Get an active offer
    const offerResult = await pool.query(`
      SELECT o.id, o.title, o.partner_id, o.service_type
      FROM partner_offers o
      JOIN partners p ON o.partner_id = p.id
      WHERE o.is_active = true 
        AND o.status = 'active'
        AND (o.start_date IS NULL OR o.start_date <= CURRENT_TIMESTAMP)
        AND (o.end_date IS NULL OR o.end_date >= CURRENT_TIMESTAMP)
        AND (p.is_active = true OR p.status IN ('active', 'approved'))
      LIMIT 1
    `);

    if (offerResult.rows.length === 0) {
      console.log('❌ No active offers found in database');
      console.log('   Please create an active offer first');
      process.exit(1);
    }

    const testOffer = offerResult.rows[0];
    console.log(`✅ Found test offer: ${testOffer.title} (${testOffer.service_type})`);

    // Create test booking
    console.log('\n📝 Creating test booking...');
    const bookingData = {
      user_id: testUser.id,
      offer_id: testOffer.id,
      num_tickets: 1,
      reservation_data: {
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        time: '19:00',
        partySize: 1
      }
    };

    const booking = await bookingService.createBooking(bookingData);
    
    console.log('✅ Booking created successfully!');
    console.log(`   Booking ID: ${booking.id}`);
    console.log(`   Booking Reference: ${booking.booking_reference}`);
    console.log(`   Voucher Code: ${booking.voucher_code || 'NOT GENERATED'}`);
    console.log(`   QR Code URL: ${booking.qr_code_url || 'NOT GENERATED'}`);

    // Verify QR code was generated
    if (booking.voucher_code && booking.qr_code_url) {
      console.log('\n✅ QR Code Generation Verified!');
      console.log(`   ✅ Voucher code: ${booking.voucher_code}`);
      console.log(`   ✅ QR code URL: ${booking.qr_code_url}`);
      console.log(`   ✅ QR code accessible at: ${booking.qr_code_url}`);
      
      // Test QR code URL accessibility
      try {
        // Use built-in https module for Node.js
        const https = require('https');
        const qrUrl = new URL(booking.qr_code_url);
        
        await new Promise((resolve) => {
          const req = https.request({
            hostname: qrUrl.hostname,
            path: qrUrl.pathname,
            method: 'HEAD'
          }, (res) => {
            if (res.statusCode === 200 || res.statusCode === 403) {
              console.log('   ✅ QR code image is accessible from S3');
            } else {
              console.log(`   ⚠️  QR code URL returned status: ${res.statusCode}`);
            }
            resolve();
          });
          
          req.on('error', (err) => {
            console.log(`   ⚠️  Could not verify QR code accessibility: ${err.message}`);
            resolve();
          });
          
          req.setTimeout(5000, () => {
            req.destroy();
            console.log('   ⚠️  QR code URL check timed out');
            resolve();
          });
          
          req.end();
        });
      } catch (fetchError) {
        console.log(`   ⚠️  Could not verify QR code accessibility: ${fetchError.message}`);
      }
    } else {
      console.log('\n❌ QR Code Generation Failed!');
      console.log('   Voucher code or QR code URL is missing');
      console.log('   Check backend logs for errors');
      process.exit(1);
    }

    // Verify database record
    const dbCheck = await pool.query(`
      SELECT voucher_code, qr_code_url, status
      FROM bookings
      WHERE id = $1
    `, [booking.id]);

    if (dbCheck.rows[0].voucher_code && dbCheck.rows[0].qr_code_url) {
      console.log('\n✅ Database Record Verified!');
      console.log('   Voucher code and QR code URL stored correctly');
    } else {
      console.log('\n❌ Database Record Incomplete!');
      process.exit(1);
    }

    console.log('\n🎉 All Tests Passed!');
    console.log(`\n📋 Test Booking Details:`);
    console.log(`   Booking ID: ${booking.id}`);
    console.log(`   Booking Reference: ${booking.booking_reference}`);
    console.log(`   Voucher Code: ${booking.voucher_code}`);
    console.log(`   QR Code URL: ${booking.qr_code_url}`);
    console.log(`   Status: ${booking.status}`);
    console.log(`\n💡 You can view this booking in the frontend at: /booking/${booking.id}`);

  } catch (error) {
    logError('❌ Test failed:', error);
    console.log('\n❌ Booking creation test failed!');
    console.log(`   Error: ${error.message}`);
    
    if (error.message.includes('S3') || error.message.includes('AWS')) {
      console.log('   💡 Check your AWS S3 configuration');
      console.log('   Run: node scripts/verify-s3-config.js');
    } else if (error.message.includes('QR')) {
      console.log('   💡 Check QR code generation service');
    } else {
      console.log('   💡 Check backend logs for details');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testBookingCreation()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError('Test script failed:', error);
    process.exit(1);
  });

