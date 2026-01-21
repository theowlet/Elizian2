-- ============================================
-- ELIZIAN COMPREHENSIVE FEATURE TABLES
-- Migration: 2025-11-24-comprehensive-feature-tables.sql
-- ============================================
-- Adds: Achievements, Referrals, Notifications, System Settings, Daily Stats
-- ============================================

-- --------------------------------------------------------------------------
-- 1. ACHIEVEMENTS SYSTEM
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  achievement_code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Display
  icon VARCHAR(10),
  badge_image_url VARCHAR(500),
  
  -- Criteria
  achievement_type VARCHAR(50) CHECK (achievement_type IN ('booking_count', 'spending_threshold', 'tier_reached', 'review_count', 'referral_count', 'streak', 'special')),
  criteria JSONB NOT NULL, -- {"bookings": 10, "type": "restaurant"}
  
  -- Rewards
  ezt_reward DECIMAL(10, 4),
  loyalty_points INT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_secret BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  progress JSONB,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type, is_active);

-- --------------------------------------------------------------------------
-- 2. REFERRALS SYSTEM
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  
  -- Rewards
  referrer_ezt_reward DECIMAL(10, 4) DEFAULT 0,
  referee_discount_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Completion
  completed_at TIMESTAMP,
  first_booking_id UUID,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id) WHERE referee_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3. NOTIFICATIONS SYSTEM
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Content
  notification_type VARCHAR(50) CHECK (notification_type IN (
    'booking_confirmation', 
    'booking_reminder', 
    'tier_upgrade', 
    'deal_alert', 
    'review_request', 
    'offer_expiring', 
    'promotional', 
    'system',
    'achievement_unlocked',
    'referral_completed',
    'voucher_received'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Action
  action_url VARCHAR(500),
  action_label VARCHAR(50),
  
  -- Channels
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_sms BOOLEAN DEFAULT false,
  sent_via_push BOOLEAN DEFAULT false,
  sent_via_in_app BOOLEAN DEFAULT true,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type, created_at DESC);

-- --------------------------------------------------------------------------
-- 4. SYSTEM SETTINGS
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(20) CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
  ('platform_name', 'Elizian', 'string', 'Platform name', true),
  ('platform_tagline', 'Premium Lifestyle Marketplace', 'string', 'Platform tagline', true),
  ('ezt_value_inr', '100', 'number', '1 EZT = INR value', true),
  ('commission_percentage', '10', 'number', 'Default commission percentage', false),
  ('max_promoted_deals', '12', 'number', 'Max deals in promoted section', false),
  ('deal_approval_required', 'true', 'boolean', 'Deals require admin approval', false),
  ('partner_auto_approval', 'false', 'boolean', 'Auto-approve new partners', false),
  ('referral_discount', '500', 'number', 'Discount for referred users (INR)', true),
  ('referral_ezt_reward', '100', 'number', 'EZT reward for referrer', true),
  ('voucher_expiry_days', '30', 'number', 'Default voucher validity in days', false),
  ('min_booking_amount', '1', 'number', 'Minimum booking amount (INR)', true),
  ('cancellation_window_hours', '24', 'number', 'Hours before booking for free cancellation', true),
  ('review_moderation_enabled', 'true', 'boolean', 'Enable review moderation', false),
  ('signup_bonus_ezt', '100', 'number', 'EZT tokens awarded on signup', true),
  ('achievement_system_enabled', 'true', 'boolean', 'Enable achievement system', false),
  ('referral_system_enabled', 'true', 'boolean', 'Enable referral system', true)
ON CONFLICT (setting_key) DO NOTHING;

-- --------------------------------------------------------------------------
-- 5. ANALYTICS & REPORTING
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date DATE NOT NULL UNIQUE,
  
  -- User Metrics
  new_users INT DEFAULT 0,
  active_users INT DEFAULT 0,
  total_users INT DEFAULT 0,
  
  -- Partner Metrics
  new_partners INT DEFAULT 0,
  active_partners INT DEFAULT 0,
  
  -- Booking Metrics
  total_bookings INT DEFAULT 0,
  completed_bookings INT DEFAULT 0,
  cancelled_bookings INT DEFAULT 0,
  
  -- Revenue Metrics
  total_revenue DECIMAL(12, 2) DEFAULT 0,
  commission_earned DECIMAL(12, 2) DEFAULT 0,
  
  -- Token Metrics
  ezt_issued DECIMAL(12, 4) DEFAULT 0,
  ezt_redeemed DECIMAL(12, 4) DEFAULT 0,
  
  -- Engagement
  avg_session_duration_minutes INT,
  total_page_views INT,
  
  -- Created
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date DESC);

-- --------------------------------------------------------------------------
-- 6. TRIGGERS & FUNCTIONS
-- --------------------------------------------------------------------------

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to achievements
DROP TRIGGER IF EXISTS update_achievements_updated_at ON achievements;
CREATE TRIGGER update_achievements_updated_at 
BEFORE UPDATE ON achievements
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to system_settings
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at 
BEFORE UPDATE ON system_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to daily_stats
DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER update_daily_stats_updated_at 
BEFORE UPDATE ON daily_stats
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------------
-- 7. SEED DATA - SAMPLE ACHIEVEMENTS
-- --------------------------------------------------------------------------

INSERT INTO achievements (achievement_code, title, description, icon, achievement_type, criteria, ezt_reward, loyalty_points, is_active) VALUES
  ('first_booking', 'First Step', 'Complete your first booking', '🎯', 'booking_count', '{"bookings": 1}'::jsonb, 10.0, 100, true),
  ('ten_bookings', 'Regular Explorer', 'Complete 10 bookings', '⭐', 'booking_count', '{"bookings": 10}'::jsonb, 50.0, 500, true),
  ('fifty_bookings', 'Lifestyle Enthusiast', 'Complete 50 bookings', '🌟', 'booking_count', '{"bookings": 50}'::jsonb, 200.0, 2000, true),
  ('spend_10k', 'Big Spender', 'Spend ₹10,000 total', '💰', 'spending_threshold', '{"amount": 10000}'::jsonb, 100.0, 1000, true),
  ('spend_50k', 'Premium Patron', 'Spend ₹50,000 total', '💎', 'spending_threshold', '{"amount": 50000}'::jsonb, 500.0, 5000, true),
  ('reach_nova', 'Nova Achiever', 'Reach Nova tier', '🌙', 'tier_reached', '{"tier": "Nova"}'::jsonb, 25.0, 250, true),
  ('reach_luminar', 'Luminar Legend', 'Reach Luminar tier', '✨', 'tier_reached', '{"tier": "Luminar"}'::jsonb, 75.0, 750, true),
  ('reach_valiant', 'Valiant Victor', 'Reach Valiant tier', '🏆', 'tier_reached', '{"tier": "Valiant"}'::jsonb, 150.0, 1500, true),
  ('reach_echelon', 'Echelon Elite', 'Reach Echelon tier', '👑', 'tier_reached', '{"tier": "Echelon"}'::jsonb, 300.0, 3000, true),
  ('five_reviews', 'Review Contributor', 'Write 5 reviews', '📝', 'review_count', '{"reviews": 5}'::jsonb, 20.0, 200, true),
  ('refer_three', 'Referral Master', 'Refer 3 friends', '👥', 'referral_count', '{"referrals": 3}'::jsonb, 150.0, 1500, true),
  ('week_streak', 'Weekly Warrior', 'Book for 7 consecutive weeks', '🔥', 'streak', '{"weeks": 7}'::jsonb, 100.0, 1000, true)
ON CONFLICT (achievement_code) DO NOTHING;

-- --------------------------------------------------------------------------
-- VERIFICATION QUERIES
-- --------------------------------------------------------------------------

-- Count of tables created
DO $$
DECLARE
  table_count INT;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('achievements', 'user_achievements', 'referrals', 'notifications', 'system_settings', 'daily_stats');
  
  RAISE NOTICE 'Created/Verified % feature tables', table_count;
END $$;

-- Count of achievements seeded
DO $$
DECLARE
  achievement_count INT;
BEGIN
  SELECT COUNT(*) INTO achievement_count FROM achievements;
  RAISE NOTICE 'Total achievements available: %', achievement_count;
END $$;

-- Count of system settings
DO $$
DECLARE
  settings_count INT;
BEGIN
  SELECT COUNT(*) INTO settings_count FROM system_settings;
  RAISE NOTICE 'Total system settings configured: %', settings_count;
END $$;

RAISE NOTICE '✅ Comprehensive feature tables migration completed successfully!';

