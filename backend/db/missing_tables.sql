-- ============================================
-- MISSING DATABASE TABLES FOR ELIZIAN
-- Creates: vouchers, bookings, archives, roles, loyalty_points
-- ============================================

-- ============================================
-- 1. ROLES TABLE (for RBAC)
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed roles
INSERT INTO roles (role_name, description, permissions) VALUES
  ('super_admin', 'Global control of partners, events, analytics, and loyalty', 
   '{"read":["*"],"write":["*"],"delete":["*"],"admin":true}'),
  ('partner_admin', 'Manage own listings, offers, and bookings with scheduling', 
   '{"read":["own_partner"],"write":["own_offers","own_events"],"scan":["vouchers"]}'),
  ('user', 'Browse, book, earn loyalty points, and view QR vouchers', 
   '{"read":["events","offers"],"write":["bookings"]}')
ON CONFLICT (role_name) DO NOTHING;

-- ============================================
-- 2. BOOKINGS TABLE (dedicated booking system)
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL,
  booking_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'redeemed', 'expired')),
  amount DECIMAL(12, 2) NOT NULL,
  commission_percentage DECIMAL(5, 2) DEFAULT 10.0,
  partner_earning DECIMAL(12, 2),
  num_tickets INTEGER DEFAULT 1,
  special_requests TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_offer_id ON bookings(offer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings(booking_date);

-- ============================================
-- 3. VOUCHERS TABLE (QR voucher system)
-- ============================================
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL UNIQUE,
  qr_code_url VARCHAR(500),
  qr_code_data TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  redeemed_by_partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vouchers_booking_id ON vouchers(booking_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_partner_id ON vouchers(partner_id);

-- ============================================
-- 4. LOYALTY_POINTS TABLE (dedicated loyalty tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  points_earned DECIMAL(15, 5) NOT NULL DEFAULT 0,
  points_balance DECIMAL(15, 5) NOT NULL DEFAULT 0,
  transaction_type VARCHAR(50) DEFAULT 'earned' CHECK (transaction_type IN ('earned', 'redeemed', 'adjusted', 'expired')),
  description TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_id ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_booking_id ON loyalty_points(booking_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_last_updated ON loyalty_points(last_updated);

-- ============================================
-- 5. ARCHIVES TABLE (for expired offers/events)
-- ============================================
CREATE TABLE IF NOT EXISTS archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL,
  archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
  archived_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  can_reactivate BOOLEAN DEFAULT true,
  reactivated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archives_event_id ON archives(event_id);
CREATE INDEX IF NOT EXISTS idx_archives_offer_id ON archives(offer_id);
CREATE INDEX IF NOT EXISTS idx_archives_archived_on ON archives(archived_on);

-- ============================================
-- 6. Add role_id to users table if missing
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
    
    -- Assign default 'user' role to existing users
    UPDATE users SET role_id = (SELECT id FROM roles WHERE role_name = 'user' LIMIT 1)
    WHERE role_id IS NULL;
  END IF;
END $$;

-- ============================================
-- 7. SYSTEM SETTINGS TABLE (for super admin config)
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('loyalty_multiplier', '1', 'Points earned per ₹100 spent (default: 1 point per ₹100)'),
  ('commission_percentage', '10.0', 'Default commission percentage for partners'),
  ('voucher_expiry_days', '30', 'Voucher expiry in days from booking date'),
  ('archive_expired_after_days', '7', 'Auto-archive offers after X days of expiry')
ON CONFLICT (setting_key) DO NOTHING;

