const { Pool } = require('pg');
const config = require('./env');
const { log, logError } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

let pool;

function createPool() {
  if (pool) {
    return pool;
  }

  const connectionOptions = config.database.url
    ? {
      connectionString: config.database.url,
      ssl: false
      // ssl: config.database.ssl
    }
    : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      ssl: false
    };

  pool = new Pool({
    ...connectionOptions,
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  });

  pool.on('error', (err) => {
    logError('Unexpected error on idle PostgreSQL client', err);
  });

  log('📦 PostgreSQL pool created');
  return pool;
}

function getPool() {
  if (!pool) {
    return createPool();
  }
  return pool;
}

// Initialize missing tables from SQL file
async function initMissingTables() {
  try {
    const sqlFile = path.join(__dirname, '../../db/missing_tables.sql');
    if (fs.existsSync(sqlFile)) {
      const sql = fs.readFileSync(sqlFile, 'utf8');
      await pool.query(sql);
      log('✅ Missing tables initialized');
    }
  } catch (err) {
    // Log error but don't throw - allow server to continue
    // Some tables might already exist with different schemas
    logError('Failed to initialize missing tables:', err);
    // Don't throw - server can still run if tables exist
  }
}

// Initialize offers table
async function initOffersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        service_type VARCHAR(50),
        discount_percentage DECIMAL(5, 2),
        discount_amount DECIMAL(10, 2),
        original_price DECIMAL(10, 2),
        discounted_price DECIMAL(10, 2),
        offer_type VARCHAR(50) DEFAULT 'percentage',
        terms_conditions TEXT,
        image_url VARCHAR(500),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        is_trending BOOLEAN DEFAULT false,
        max_redemptions INTEGER,
        current_redemptions INTEGER DEFAULT 0,
        applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
        applicable_categories JSONB,
        min_purchase_amount DECIMAL(10, 2),
        promo_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_partner_offers_partner_id ON partner_offers(partner_id);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_active ON partner_offers(is_active, end_date);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_trending ON partner_offers(is_trending);
      CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
    `);

    // Migration: Handle existing applicable_days JSONB column and service_type
    await pool.query(`
      DO $$ 
      BEGIN
        -- Check if applicable_days exists as JSONB (old format)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'partner_offers' 
            AND column_name = 'applicable_days' 
            AND data_type = 'jsonb'
        ) THEN
          -- Create temporary array column if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_days_array'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_days_array TEXT[];
          END IF;
          
          -- Migrate JSONB to TEXT[] array
          UPDATE partner_offers 
          SET applicable_days_array = (
            SELECT ARRAY(SELECT jsonb_array_elements_text(applicable_days))
            WHERE applicable_days IS NOT NULL
          )
          WHERE applicable_days IS NOT NULL 
            AND (applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL);
          
          -- Set default for null values
          UPDATE partner_offers 
          SET applicable_days_array = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          WHERE applicable_days_array IS NULL OR array_length(applicable_days_array, 1) IS NULL;
          
          -- Drop old JSONB column and rename array column
          ALTER TABLE partner_offers DROP COLUMN IF EXISTS applicable_days;
          ALTER TABLE partner_offers RENAME COLUMN applicable_days_array TO applicable_days;
        ELSE
          -- Ensure column exists with default
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'partner_offers' 
              AND column_name = 'applicable_days'
          ) THEN
            ALTER TABLE partner_offers ADD COLUMN applicable_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          END IF;
          
          -- Set default for any null values
          UPDATE partner_offers 
          SET applicable_days = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          WHERE applicable_days IS NULL OR array_length(applicable_days, 1) IS NULL;
        END IF;
        
        -- Add service_type column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'partner_offers' AND column_name = 'service_type'
        ) THEN
          ALTER TABLE partner_offers ADD COLUMN service_type VARCHAR(50);
          CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
        END IF;
      END $$;
    `);

    log('✅ Offers table initialized');
  } catch (err) {
    logError('Failed to initialize offers table:', err);
    throw err;
  }
}

// Initialize menu items table
async function initMenuItemsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100),
        image_url VARCHAR(500),
        is_available BOOLEAN DEFAULT true,
        is_trending BOOLEAN DEFAULT false,
        event_date TIMESTAMP,
        venue_name VARCHAR(255),
        venue_address TEXT,
        max_capacity INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_menu_items_partner_id ON menu_items(partner_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_trending ON menu_items(is_trending);
    `);
    log('✅ Menu items table initialized');
  } catch (err) {
    logError('Failed to initialize menu items table:', err);
    throw err;
  }
}

// Patch partners table for missing columns
async function patchPartnersTable() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='status') THEN
          ALTER TABLE partners ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
        END IF;
      END $$;
    `);
    log('✅ Partners table patched');
  } catch (err) {
    logError('Failed to patch partners table:', err);
  }
}

// Initialize accounts table
async function initAccountsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
        public_key VARCHAR(255) NOT NULL,
        private_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_or_partner CHECK (
          (user_id IS NOT NULL AND partner_id IS NULL) OR 
          (user_id IS NULL AND partner_id IS NOT NULL)
        )
      );
      
      -- Add partner_id column if it doesn't exist (for existing tables)
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='partner_id') THEN
          ALTER TABLE accounts ADD COLUMN partner_id UUID REFERENCES partners(id) ON DELETE CASCADE;
          -- Make user_id nullable if it was NOT NULL
          ALTER TABLE accounts ALTER COLUMN user_id DROP NOT NULL;
          -- Add constraint
          ALTER TABLE accounts ADD CONSTRAINT user_or_partner CHECK (
            (user_id IS NOT NULL AND partner_id IS NULL) OR 
            (user_id IS NULL AND partner_id IS NOT NULL)
          );
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_partner_id ON accounts(partner_id);
    `);
    log('✅ Accounts table initialized');
  } catch (err) {
    logError('Failed to initialize accounts table:', err);
    throw err;
  }
}

// Initialize orders table
async function initOrdersTable() {
  try {
    // Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add user_id column if it doesn't exist
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'user_id'
          ) THEN
            ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    } catch (colErr) {
      // Column might already exist or table structure is different, ignore
      logError('Note: Could not add user_id column to orders (may already exist):', colErr.message);
    }

    // Create indexes (ignore errors if they already exist)
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id);
      `);
    } catch (idxErr) {
      // Index might already exist, ignore
    }

    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      `);
    } catch (idxErr) {
      // Index might fail if user_id column doesn't exist, ignore
    }

    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_orders_booking_id ON orders(booking_id);
      `);
    } catch (idxErr) {
      // Index might already exist, ignore
    }

    log('✅ Orders table initialized');
  } catch (err) {
    logError('Failed to initialize orders table:', err);
    // Don't throw - allow server to continue
  }
}

// Initialize all tables
async function initializeAllTables() {
  const p = getPool();
  pool = p; // Set global pool reference

  try {
    await initMissingTables();
    await initOffersTable();
    await initMenuItemsTable();
    await patchPartnersTable();
    await initAccountsTable();
    await initOrdersTable();
    log('✅ All database tables initialized');
  } catch (err) {
    logError('Failed to initialize database tables:', err);
    // Don't throw - allow server to continue even if some tables fail
    // The server can still run if tables already exist with different schemas
  }
}

module.exports = {
  createPool,
  getPool,
  initMissingTables,
  initOffersTable,
  initMenuItemsTable,
  patchPartnersTable,
  initAccountsTable,
  initOrdersTable,
  initializeAllTables
};

