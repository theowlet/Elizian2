/*
  Seed script for Elizian
  - Creates core roles (super_admin, partner_admin, user)
  - Inserts a Super Admin user (email: mailfornishantverma@gmail.com, password: admin123)
  - Adds sample partners, events, and partner offers

  Run:
    POSTGRES_URL=postgresql://elizian_user:elizian_pass_2024@localhost:5432/elizian \
    node backend/scripts/seed_data.js
*/

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://elizian_user:elizian_pass_2024@localhost:5432/elizian';
const pool = new Pool({ connectionString });

async function seedData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Ensure roles exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_name VARCHAR(50) UNIQUE NOT NULL
      );
    `);
    await client.query(`
      INSERT INTO roles (role_name) VALUES 
        ('super_admin'), ('partner_admin'), ('user')
      ON CONFLICT (role_name) DO NOTHING;
    `);

    // 2) Ensure users table has needed columns
    // (Assumes users table already exists in your schema.)

    // 3) Create Super Admin user (idempotent by email)
    const passwordHash = await bcrypt.hash('admin123', 10);
    const { rows: roleRows } = await client.query(`SELECT id FROM roles WHERE role_name='super_admin' LIMIT 1`);
    const superRoleId = roleRows[0]?.id;
    await client.query(`
      INSERT INTO users (id, first_name, last_name, email, password_hash, role_id)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (email) DO NOTHING;
    `, [uuidv4(), 'Super', 'Admin', 'mailfornishantverma@gmail.com', passwordHash, superRoleId]);

    // 4) Sample partners (minimal required columns; adjust if your schema has NOT NULLs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        address TEXT,
        is_active BOOLEAN DEFAULT true
      );
    `);

    const partner1Id = uuidv4();
    const partner2Id = uuidv4();
    await client.query(`
      INSERT INTO partners (id, name, email, phone, address, is_active) VALUES
        ($1, 'The Grand Restaurant', 'grand@example.com', '9876543210', '123 Main St, Delhi', true),
        ($2, 'Wellness Spa & Salon', 'wellness@example.com', '9876543211', '456 Park Avenue, Mumbai', true)
      ON CONFLICT (email) DO NOTHING;
    `, [partner1Id, partner2Id]);

    // 5) Sample events (aligned with current backend: title, start_time, booking_cap, price_per_ticket, status, image_url)
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        booking_cap INTEGER DEFAULT 0,
        price_per_ticket NUMERIC(10,2) DEFAULT 0,
        image_url TEXT,
        category VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const event1Id = uuidv4();
    const event2Id = uuidv4();
    const event3Id = uuidv4();
    const event4Id = uuidv4();

    await client.query(`
      INSERT INTO events (id, partner_id, title, description, start_time, end_time, booking_cap, price_per_ticket, image_url, category, status)
      VALUES
        ($1, $5, 'Fine Dining Experience', 'Luxurious 5-course meal by award-winning chefs', NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 5 hours', 50, 2500.00, '/assets/default-offer.jpg', 'dining', 'active'),
        ($2, $6, 'Relaxation Spa Package', 'Full body massage and aromatherapy session', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 2 hours', 30, 3500.00, '/assets/default-offer.jpg', 'spa', 'active'),
        ($3, $5, 'Weekend Brunch Special', 'All-you-can-eat brunch buffet with live music', NOW() + INTERVAL '6 days', NOW() + INTERVAL '6 days 4 hours', 100, 1500.00, '/assets/default-offer.jpg', 'dining', 'active'),
        ($4, $6, 'Yoga & Wellness Retreat', 'Full day yoga, meditation, and healthy meals', NOW() + INTERVAL '8 days', NOW() + INTERVAL '8 days 6 hours', 25, 4000.00, '/assets/default-offer.jpg', 'wellness', 'active')
      ON CONFLICT DO NOTHING;
    `, [event1Id, event2Id, event3Id, event4Id, partner1Id, partner2Id]);

    // 6) Sample partner offers (compatible with /api/v1/offers union logic)
    await client.query(`
      CREATE TABLE IF NOT EXISTS partner_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        discount_percentage NUMERIC(5,2),
        original_price NUMERIC(10,2),
        discounted_price NUMERIC(10,2),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        is_trending BOOLEAN DEFAULT false,
        service_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO partner_offers (partner_id, title, description, discount_percentage, original_price, discounted_price, start_date, end_date, is_active, is_trending, service_type)
      VALUES
        ($1, 'Early Bird Dining Offer', 'Book before 6 PM and get 20% off', 20, 2500, 2000, NOW(), NOW() + INTERVAL '15 days', true, true, 'dining'),
        ($2, 'Weekend Spa Delight', 'Special weekend pricing on spa packages', 15, 3500, 2975, NOW(), NOW() + INTERVAL '20 days', true, false, 'spa')
      ON CONFLICT DO NOTHING;
    `, [partner1Id, partner2Id]);

    await client.query('COMMIT');
    console.log('✅ Seed data inserted successfully');
    console.log('📧 Super Admin Email: mailfornishantverma@gmail.com');
    console.log('🔑 Super Admin Password: admin123');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedData().catch((e) => { console.error(e); process.exit(1); });


