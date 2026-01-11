/**
 * Run Voucher Redemption System Migration
 * Adds voucher_code, qr_code_url, and redemption_audit table
 */

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');

const pool = getPool();

async function runMigration() {
  const client = await pool.connect();
  
  try {
    log('🔄 Running Voucher Redemption System migration...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'db', 'migrations', '2025-01-22-voucher-redemption-system.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await client.query('BEGIN');
    
    try {
      await client.query(migrationSQL);
      await client.query('COMMIT');
      
      log('✅ Voucher Redemption System migration completed successfully!');
      log('   - Added voucher_code column to bookings table');
      log('   - Added qr_code_url column to bookings table');
      log('   - Created redemption_audit table');
      log('   - Created indexes for performance');
      log('   - Added unique constraint for idempotent redemption');
      
      // Verify migration
      const verifyResult = await client.query(`
        SELECT 
          column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name IN ('voucher_code', 'qr_code_url')
      `);
      
      if (verifyResult.rows.length === 2) {
        log('✅ Verified: voucher_code and qr_code_url columns exist');
      } else {
        log('⚠️  Warning: Some columns may not have been created');
      }
      
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'redemption_audit'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        log('✅ Verified: redemption_audit table exists');
      } else {
        log('⚠️  Warning: redemption_audit table may not have been created');
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    logError('❌ Migration failed:', error);
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      log('⚠️  Some columns/tables may already exist. This is okay.');
      log('✅ Migration may have already been applied.');
    } else {
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    logError('💥 Migration script failed:', error);
    process.exit(1);
  });

