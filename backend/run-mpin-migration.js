/**
 * Run M-PIN Migration
 * Adds mpin_hash and related columns to user_auth_credentials table
 */

const { getPool } = require('./src/config/db');
const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');

const pool = getPool();

async function runMigration() {
  const client = await pool.connect();
  
  try {
    log('🔄 Running M-PIN migration...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '2025-01-05-add-mpin-support.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await client.query('BEGIN');
    
    try {
      await client.query(migrationSQL);
      await client.query('COMMIT');
      
      log('✅ M-PIN migration completed successfully!');
      log('   - Added mpin_hash column');
      log('   - Added mpin_set_at column');
      log('   - Added mpin_failed_attempts column');
      log('   - Added mpin_locked_until column');
      log('   - Created index for faster lookups');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    logError('❌ Migration failed:', error);
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      log('⚠️  Some columns may already exist. This is okay.');
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

