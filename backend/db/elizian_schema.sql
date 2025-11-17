-- ============================================
-- ELIZIAN APP - Multi-Category Loyalty System
-- Database Schema (PostgreSQL)
-- ============================================

-- ============================================
-- 1. USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  country_code VARCHAR(5) NOT NULL DEFAULT '+91',
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  profile_photo_url VARCHAR(500),
  address TEXT,
  city VARCHAR(100),
  state_province VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  date_of_birth DATE,
  gender VARCHAR(20),
  anniversary_date DATE,
  current_tier_id UUID NOT NULL,
  total_tokens_earned DECIMAL(15, 5) DEFAULT 0,
  total_tokens_spent DECIMAL(15, 5) DEFAULT 0,
  available_tokens DECIMAL(15, 5) DEFAULT 0,
  total_spend DECIMAL(12, 2) DEFAULT 0,
  firebase_uid VARCHAR(255) UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

CREATE TABLE user_auth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  phone_verified BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMP,
  email_verified_at TIMESTAMP,
  last_password_change TIMESTAMP,
  password_reset_token VARCHAR(500),
  password_reset_expires TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  account_locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token VARCHAR(1024) NOT NULL,
  refresh_token VARCHAR(1024) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  country_code VARCHAR(5) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  otp_hash VARCHAR(255),
  purpose VARCHAR(50) NOT NULL,
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(500) NOT NULL UNIQUE,
  purpose VARCHAR(50) DEFAULT 'email_verification',
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. TIER SYSTEM
-- ============================================

CREATE TABLE tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  level INT NOT NULL UNIQUE,
  token_earning_percentage DECIMAL(5, 2) NOT NULL,
  min_spend_required DECIMAL(12, 2) DEFAULT 0,
  description TEXT,
  color_code VARCHAR(7),
  icon_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tiers (name, level, token_earning_percentage, min_spend_required, description, color_code) 
VALUES
  ('Ather', 1, 1.00, 0, 'Default tier', '#B0BEC5'),
  ('Nova', 2, 2.00, 10000, 'Earned tier', '#64B5F6'),
  ('Luminar', 3, 3.00, 50000, 'Premium tier', '#9575CD'),
  ('Valiant', 4, 4.00, 150000, 'Elite tier', '#66BB6A'),
  ('Echelon', 5, 5.00, 500000, 'Invite-only tier', '#FFD54F');

CREATE TABLE tier_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_tier_id UUID NOT NULL REFERENCES tiers(id),
  previous_tier_id UUID REFERENCES tiers(id),
  total_spend DECIMAL(12, 2) DEFAULT 0,
  progress_percentage DECIMAL(5, 2) DEFAULT 0,
  promoted_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. CATEGORIES
-- ============================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url VARCHAR(500),
  is_active BOOLEAN DEFAULT false,
  launch_date TIMESTAMP,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (name, slug, description, is_active, display_order)
VALUES
  ('Dining', 'dining', 'Restaurants, cafes, and food establishments', true, 1),
  ('Health & Wellness', 'health-wellness', 'Gyms, spas, clinics, wellness centers', false, 2),
  ('Events', 'events', 'Concert tickets, theater, sports events', false, 3),
  ('Live Performances', 'live-performances', 'Concerts, comedy shows, theater', false, 4),
  ('Travel', 'travel', 'Hotels, flights, tours, vacation packages', false, 5),
  ('Others', 'others', 'Miscellaneous partners and services', false, 6);

-- ============================================
-- 4. PARTNERS (Multi-category)
-- ============================================

CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID NOT NULL REFERENCES categories(id),
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  phone_number VARCHAR(20),
  website_url VARCHAR(500),
  email VARCHAR(255),
  partner_discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  nfc_tag_id VARCHAR(255),
  partner_category_type VARCHAR(100),
  rating DECIMAL(3, 2),
  review_count INT DEFAULT 0,
  partner_code VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_nfc_tag UNIQUE(nfc_tag_id)
);

CREATE TABLE partner_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  image_type VARCHAR(50),
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partner_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL,
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partner_category_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. CHECK-INS
-- ============================================

CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  nfc_tag_id VARCHAR(255),
  check_in_token VARCHAR(500),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  check_in_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  transaction_id UUID,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_out_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. TRANSACTIONS
-- ============================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  check_in_id UUID REFERENCES check_ins(id),
  bill_amount DECIMAL(12, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2) NOT NULL,
  discount_amount DECIMAL(12, 2) NOT NULL,
  amount_after_discount DECIMAL(12, 2) NOT NULL,
  tokens_redeemed DECIMAL(15, 5) DEFAULT 0,
  tokens_earned DECIMAL(15, 5) DEFAULT 0,
  net_token_change DECIMAL(15, 5),
  user_tier_at_transaction UUID REFERENCES tiers(id),
  transaction_type VARCHAR(50) DEFAULT 'purchase',
  payment_source VARCHAR(50) DEFAULT 'app2',
  payment_method VARCHAR(100),
  payment_status VARCHAR(50) DEFAULT 'pending',
  app2_transaction_id VARCHAR(255) UNIQUE,
  webhook_signature VARCHAR(512),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. TOKEN LEDGER (Immutable)
-- ============================================

CREATE TABLE token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id),
  amount DECIMAL(15, 5) NOT NULL,
  ledger_type VARCHAR(50) NOT NULL,
  balance_before DECIMAL(15, 5) NOT NULL,
  balance_after DECIMAL(15, 5) NOT NULL,
  category_id UUID REFERENCES categories(id),
  description TEXT,
  reference_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. PAYMENT METHODS
-- ============================================

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_type VARCHAR(50) NOT NULL,
  token_reference VARCHAR(500),
  last_four VARCHAR(4),
  card_brand VARCHAR(50),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 9. REFERRALS
-- ============================================

CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  bonus_tokens DECIMAL(15, 5) DEFAULT 250,
  max_uses INT DEFAULT NULL,
  current_uses INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id),
  bonus_credited_to_referrer BOOLEAN DEFAULT false,
  bonus_credited_to_referred BOOLEAN DEFAULT false,
  referrer_bonus DECIMAL(15, 5) DEFAULT 250,
  referred_bonus DECIMAL(15, 5) DEFAULT 250,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_referral UNIQUE(referrer_id, referred_user_id)
);

-- ============================================
-- 10. USER CONNECTIONS
-- ============================================

CREATE TABLE user_partner_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  is_connected BOOLEAN DEFAULT true,
  favorite BOOLEAN DEFAULT false,
  total_visits INT DEFAULT 0,
  total_spend DECIMAL(12, 2) DEFAULT 0,
  last_visit TIMESTAMP,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_connection UNIQUE(user_id, partner_id)
);

CREATE TABLE user_category_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  is_interested BOOLEAN DEFAULT false,
  notification_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_preference UNIQUE(user_id, category_id)
);

-- ============================================
-- 11. ACHIEVEMENTS
-- ============================================

CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url VARCHAR(500),
  badge_type VARCHAR(50),
  category_id UUID REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);

-- ============================================
-- 12. WEBHOOKS & INTEGRATION
-- ============================================

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  source_app VARCHAR(50),
  category_id UUID REFERENCES categories(id),
  payload JSONB NOT NULL,
  signature VARCHAR(512),
  is_verified BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  retry_count INT DEFAULT 0,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name VARCHAR(100) NOT NULL,
  secret_key VARCHAR(500) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- ============================================
-- 13. AUDIT & SUPPORT
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(50) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_phone ON users(phone_number, country_code);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tier ON users(current_tier_id);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_partners_category ON partners(category_id);
CREATE INDEX idx_partners_active ON partners(is_active);
CREATE INDEX idx_check_ins_user ON check_ins(user_id);
CREATE INDEX idx_check_ins_partner ON check_ins(partner_id);
CREATE INDEX idx_check_ins_category ON check_ins(category_id);
CREATE INDEX idx_check_ins_timestamp ON check_ins(checked_in_at);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_partner ON transactions(partner_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_timestamp ON transactions(created_at);
CREATE INDEX idx_transactions_app2_id ON transactions(app2_transaction_id);
CREATE INDEX idx_token_ledger_user ON token_ledger(user_id);
CREATE INDEX idx_token_ledger_category ON token_ledger(category_id);
CREATE INDEX idx_token_ledger_timestamp ON token_ledger(created_at);
CREATE INDEX idx_user_partner_conn ON user_partner_connections(user_id, partner_id);
CREATE INDEX idx_user_category_pref ON user_category_preferences(user_id, category_id);
CREATE INDEX idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_category ON webhook_logs(category_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_transactions_timestamp
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_categories_timestamp
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_partners_timestamp
BEFORE UPDATE ON partners
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
