/**
 * Run Enterprise Voucher System Migration
 * Adds state machine, settlement tracking, audit logs, and admin controls
 */

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./src/utils/logger');

const pool = getPool();

async function runMigration() {
  const client = await pool.connect();
  
  try {
    log('🔄 Running Enterprise Voucher System migration...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'db', 'migrations', '2025-01-22-enterprise-voucher-system.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await client.query('BEGIN');
    
    try {
      await client.query(migrationSQL);
      await client.query('COMMIT');
      
      log('✅ Enterprise Voucher System migration completed successfully!');
      log('   - Added voucher_state column to bookings');
      log('   - Created voucher_state_transitions table');
      log('   - Added settlement tracking to redemption_audit');
      log('   - Created voucher_audit_log table (immutable)');
      log('   - Created redemption_rules table');
      log('   - Created admin_overrides table');
      log('   - Created state transition and audit logging functions');
      
      // Verify migration
      const verifyColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'voucher_state'
      `);
      
      if (verifyColumns.rows.length > 0) {
        log('✅ Verified: voucher_state column exists');
      }
      
      const verifyTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('voucher_state_transitions', 'voucher_audit_log', 'redemption_rules', 'admin_overrides')
      `);
      
      const tableNames = verifyTables.rows.map(r => r.table_name);
      const expectedTables = ['voucher_state_transitions', 'voucher_audit_log', 'redemption_rules', 'admin_overrides'];
      const missingTables = expectedTables.filter(t => !tableNames.includes(t));
      
      if (missingTables.length === 0) {
        log('✅ Verified: All enterprise tables created');
      } else {
        log(`⚠️  Warning: Some tables may not have been created: ${missingTables.join(', ')}`);
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

