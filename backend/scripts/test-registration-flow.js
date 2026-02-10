const { registerUser } = require('../services/authService');
const { getPool, initializeAllTables } = require('../src/config/db');
const { log } = require('../utils/logger');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

async function testRegistration() {
    const pool = getPool();
    try {
        log('🧪 Starting Registration Flow Test...');

        // Check if users table exists
        const tableCheck = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')");
        if (!tableCheck.rows[0].exists) {
            log('⚠️ Core tables missing. Running elizian_schema.sql...');
            const schemaPath = path.join(__dirname, '../db/elizian_schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(schemaSql);
            log('✅ Core schema applied.');
        }

        // Unconditionally fix schema discrepancies
        try {
            await pool.query(`
          DO $$ 
          BEGIN 
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='otp_sessions' AND column_name='is_verified') THEN
              ALTER TABLE otp_sessions RENAME COLUMN is_verified TO verified;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='otp_sessions' AND column_name='attempt_count') THEN
              ALTER TABLE otp_sessions RENAME COLUMN attempt_count TO attempts;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='otp_sessions' AND column_name='otp_code' AND is_nullable='NO') THEN
              ALTER TABLE otp_sessions ALTER COLUMN otp_code DROP NOT NULL;
            END IF;
            -- Patch users table for signup bonus
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='signup_bonus_credited') THEN
              ALTER TABLE users ADD COLUMN signup_bonus_credited BOOLEAN DEFAULT false;
            END IF;
          END $$;
        `);
            log('✅ Schema patched (if needed).');
        } catch (err) {
            log('⚠️ Schema patch warning: ' + err.message);
        }

        // Mock JWT_SECRET if missing
        if (!process.env.JWT_SECRET) {
            process.env.JWT_SECRET = 'test_secret_123';
            log('⚠️ JWT_SECRET missing, using mock secret.');
        }

        // Create dummy events table if missing (to satisfy foreign keys in missing_tables.sql)
        const eventsCheck = await pool.query("SELECT to_regclass('events')");
        if (!eventsCheck.rows[0].to_regclass) {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          partner_id UUID,
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
            log('✅ Dummy events table created.');
        }

        await initializeAllTables();

        // Generate random phone number to avoid conflicts
        const randomPhone = '99' + Math.floor(Math.random() * 100000000);
        const mockUser = {
            phone_number: randomPhone,
            first_name: 'Test',
            last_name: 'User',
            email: `test${randomPhone}@example.com`,
            password: 'password123'
        };

        // We need to bypass OTP check? 
        // authService.registerUser requires a VERIFIED OTP session.
        // So we must manually insert a verified OTP session for this number first.

        log(`Creating mock verified OTP session for ${randomPhone}...`);
        await pool.query(
            `INSERT INTO otp_sessions (phone_number, country_code, otp_hash, verified, verified_at, expires_at, purpose)
       VALUES ($1, '+91', 'mock_hash', true, NOW(), NOW() + interval '1 hour', 'login')`,
            [randomPhone]
        );

        log('Calling registerUser...');
        const result = await registerUser(mockUser);

        log(`✅ User registered with ID: ${result.user.id}`);

        // Verify Account creation
        const accountRes = await pool.query('SELECT * FROM accounts WHERE user_id = $1', [result.user.id]);

        if (accountRes.rows.length > 0) {
            log('✅ Account confirmed in DB:');
            log(`   Public Key: ${accountRes.rows[0].public_key}`);
            log(`   Private Key: ${accountRes.rows[0].private_key.substring(0, 10)}...`);
        } else {
            console.error('❌ No account found in DB!');
            process.exit(1);
        }

        log('Test Passed!');
    } catch (err) {
        console.error('❌ Test Failed:', err);
    } finally {
        pool.end();
    }
}

testRegistration();
