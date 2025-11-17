#!/usr/bin/env node
/**
 * Script to reset partner password
 * Usage: node reset_partner_password.js <email> <new_password>
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function resetPartnerPassword(email, newPassword) {
  try {
    console.log(`Resetting password for: ${email}`);
    
    // Find partner
    const partnerResult = await pool.query(
      `SELECT id, name, email FROM partners WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    
    if (partnerResult.rows.length === 0) {
      console.error(`❌ Partner not found: ${email}`);
      process.exit(1);
    }
    
    const partner = partnerResult.rows[0];
    console.log(`✅ Found partner: ${partner.name} (${partner.email})`);
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log(`✅ Password hashed`);
    
    // Check if partner_auth entry exists
    const authCheck = await pool.query(
      `SELECT partner_id FROM partner_auth WHERE partner_id = $1`,
      [partner.id]
    );
    
    if (authCheck.rows.length === 0) {
      // Create new entry
      await pool.query(
        `INSERT INTO partner_auth (partner_id, password_hash, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [partner.id, hashedPassword]
      );
      console.log(`✅ Created new partner_auth entry`);
    } else {
      // Update existing entry
      await pool.query(
        `UPDATE partner_auth SET password_hash = $1, updated_at = NOW() WHERE partner_id = $2`,
        [hashedPassword, partner.id]
      );
      console.log(`✅ Updated password hash`);
    }
    
    // Verify password works
    const verifyResult = await pool.query(
      `SELECT password_hash FROM partner_auth WHERE partner_id = $1`,
      [partner.id]
    );
    
    const isValid = await bcrypt.compare(newPassword, verifyResult.rows[0].password_hash);
    
    if (isValid) {
      console.log(`✅ Password reset successful!`);
      console.log(`✅ Verification: Password matches hash`);
      console.log(`\nYou can now login with:`);
      console.log(`  Email: ${email}`);
      console.log(`  Password: ${newPassword}`);
    } else {
      console.error(`❌ Verification failed - something went wrong`);
      process.exit(1);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node reset_partner_password.js <email> <new_password>');
  console.error('Example: node reset_partner_password.js hermanos70A@gmail.com Elizian@1');
  process.exit(1);
}

resetPartnerPassword(email, password);

