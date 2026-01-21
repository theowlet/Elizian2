-- ============================================
-- ELIZIAN COMPREHENSIVE FEATURES - ALTER MIGRATION
-- Migration: 2025-11-24-comprehensive-features-alt.sql
-- ============================================
-- Extends existing tables with missing columns
-- ============================================

-- --------------------------------------------------------------------------
-- 1. EXTEND ACHIEVEMENTS TABLE
-- --------------------------------------------------------------------------

-- Add missing columns to achievements table
ALTER TABLE achievements 
  ADD COLUMN IF NOT EXISTS achievement_code VARCHAR(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS achievement_type VARCHAR(50) CHECK (achievement_type IN ('booking_count', 'spending_threshold', 'tier_reached', 'review_count', 'referral_count', 'streak', 'special')),
  ADD COLUMN IF NOT EXISTS criteria JSONB,
  ADD COLUMN IF NOT EXISTS ezt_reward DECIMAL(10, 4),
  ADD COLUMN IF NOT EXISTS loyalty_points INT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Backfill title from name if empty
UPDATE achievements SET title = name WHERE title IS NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type, is_active);
CREATE INDEX IF NOT EXISTS idx_achievements_code ON achievements(achievement_code) WHERE achievement_code IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2. EXTEND USER_ACHIEVEMENTS TABLE
-- --------------------------------------------------------------------------

-- Add missing columns to user_achievements
ALTER TABLE user_achievements
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS progress JSONB;

-- --------------------------------------------------------------------------
-- 3. EXTEND REFERRALS TABLE (or create new one)
-- --------------------------------------------------------------------------

-- The existing referrals table has a different schema
-- Let's create a new table for the referral code system
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
  
  -- Rewards configuration
  referrer_ezt_reward DECIMAL(10, 4) DEFAULT 100,
  referee_discount_amount DECIMAL(10, 2) DEFAULT 500,
  
  -- Usage tracking
  times_used INT DEFAULT 0,
  max_uses INT DEFAULT NULL, -- NULL = unlimited
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_status ON referral_codes(status);

-- Add columns to existing referrals table to track code-based referrals
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS referee_id UUID,
  ADD COLUMN IF NOT EXISTS first_booking_id UUID,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS referrer_ezt_reward DECIMAL(10, 4) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS referee_discount_amount DECIMAL(10, 2) DEFAULT 500;

-- Create index on new columns
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status) WHERE status IS NOT NULL;

-- --------------------------------------------------------------------------
-- 4. EXTEND SYSTEM_SETTINGS TABLE
-- --------------------------------------------------------------------------

-- Add missing columns to system_settings
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS setting_type VARCHAR(20) CHECK (setting_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Insert/update default settings
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
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  setting_type = EXCLUDED.setting_type,
  description = EXCLUDED.description,
  is_public = EXCLUDED.is_public;

-- --------------------------------------------------------------------------
-- 5. CREATE NOTIFICATIONS TABLE
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
-- 6. CREATE DAILY_STATS TABLE
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
-- 7. SEED SAMPLE ACHIEVEMENTS
-- --------------------------------------------------------------------------

INSERT INTO achievements (
  achievement_code, name, title, description, icon_url, achievement_type, 
  criteria, ezt_reward, loyalty_points, is_active
) VALUES
  ('first_booking', 'First Step', 'First Step', 'Complete your first booking', '🎯', 'booking_count', '{"bookings": 1}'::jsonb, 10.0, 100, true),
  ('ten_bookings', 'Regular Explorer', 'Regular Explorer', 'Complete 10 bookings', '⭐', 'booking_count', '{"bookings": 10}'::jsonb, 50.0, 500, true),
  ('fifty_bookings', 'Lifestyle Enthusiast', 'Lifestyle Enthusiast', 'Complete 50 bookings', '🌟', 'booking_count', '{"bookings": 50}'::jsonb, 200.0, 2000, true),
  ('spend_10k', 'Big Spender', 'Big Spender', 'Spend ₹10,000 total', '💰', 'spending_threshold', '{"amount": 10000}'::jsonb, 100.0, 1000, true),
  ('spend_50k', 'Premium Patron', 'Premium Patron', 'Spend ₹50,000 total', '💎', 'spending_threshold', '{"amount": 50000}'::jsonb, 500.0, 5000, true),
  ('reach_nova', 'Nova Achiever', 'Nova Achiever', 'Reach Nova tier', '🌙', 'tier_reached', '{"tier": "Nova"}'::jsonb, 25.0, 250, true),
  ('reach_luminar', 'Luminar Legend', 'Luminar Legend', 'Reach Luminar tier', '✨', 'tier_reached', '{"tier": "Luminar"}'::jsonb, 75.0, 750, true),
  ('reach_valiant', 'Valiant Victor', 'Valiant Victor', 'Reach Valiant tier', '🏆', 'tier_reached', '{"tier": "Valiant"}'::jsonb, 150.0, 1500, true),
  ('reach_echelon', 'Echelon Elite', 'Echelon Elite', 'Reach Echelon tier', '👑', 'tier_reached', '{"tier": "Echelon"}'::jsonb, 300.0, 3000, true),
  ('five_reviews', 'Review Contributor', 'Review Contributor', 'Write 5 reviews', '📝', 'review_count', '{"reviews": 5}'::jsonb, 20.0, 200, true),
  ('refer_three', 'Referral Master', 'Referral Master', 'Refer 3 friends', '👥', 'referral_count', '{"referrals": 3}'::jsonb, 150.0, 1500, true),
  ('week_streak', 'Weekly Warrior', 'Weekly Warrior', 'Book for 7 consecutive weeks', '🔥', 'streak', '{"weeks": 7}'::jsonb, 100.0, 1000, true)
ON CONFLICT (achievement_code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  achievement_type = EXCLUDED.achievement_type,
  criteria = EXCLUDED.criteria,
  ezt_reward = EXCLUDED.ezt_reward,
  loyalty_points = EXCLUDED.loyalty_points;

-- --------------------------------------------------------------------------
-- VERIFICATION
-- --------------------------------------------------------------------------

SELECT '✅ Extended achievements table with ' || COUNT(*) || ' achievements' as status
FROM achievements WHERE achievement_code IS NOT NULL;

SELECT '✅ Configured ' || COUNT(*) || ' system settings' as status
FROM system_settings;

SELECT '✅ Comprehensive features migration completed!' as status;

