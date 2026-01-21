-- ============================================
-- LOYALTY TIERS SYSTEM MIGRATION
-- ============================================
-- This migration creates the complete 5-tier loyalty system
-- with automatic tier upgrades based on annual spending

-- 1. Create Tiers Table
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name VARCHAR(50) NOT NULL UNIQUE,
  tier_level INTEGER NOT NULL UNIQUE,
  min_annual_spend DECIMAL(10, 2) NOT NULL,
  max_annual_spend DECIMAL(10, 2),
  ezt_reward_percentage DECIMAL(5, 2) NOT NULL,
  benefits JSONB,
  badge_color VARCHAR(20),
  badge_icon VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tiers
INSERT INTO loyalty_tiers (tier_name, tier_level, min_annual_spend, max_annual_spend, ezt_reward_percentage, badge_color, badge_icon, benefits) VALUES
('Aether', 1, 0, 9999.99, 1.00, '#94a3b8', '⭐', '{"description": "Entry level tier", "perks": ["1% EZT rewards"]}'::jsonb),
('Nova', 2, 10000.00, 49999.99, 2.00, '#3b82f6', '💎', '{"description": "Silver tier", "perks": ["2% EZT rewards", "Priority support"]}'::jsonb),
('Luminar', 3, 50000.00, 149999.99, 3.00, '#8b5cf6', '👑', '{"description": "Gold tier", "perks": ["3% EZT rewards", "Priority support", "Exclusive deals"]}'::jsonb),
('Valiant', 4, 150000.00, 499999.99, 4.00, '#f59e0b', '🏆', '{"description": "Platinum tier", "perks": ["4% EZT rewards", "Priority support", "Exclusive deals", "VIP events"]}'::jsonb),
('Echelon', 5, 500000.00, NULL, 5.00, '#ef4444', '🔥', '{"description": "Elite tier", "perks": ["5% EZT rewards", "Priority support", "Exclusive deals", "VIP events", "Personal concierge"]}'::jsonb)
ON CONFLICT (tier_name) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tiers_level ON loyalty_tiers(tier_level);
CREATE INDEX IF NOT EXISTS idx_tiers_spend_range ON loyalty_tiers(min_annual_spend, max_annual_spend);

-- 2. Add User Tier Fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES loyalty_tiers(id),
ADD COLUMN IF NOT EXISTS current_tier_name VARCHAR(50) DEFAULT 'Aether',
ADD COLUMN IF NOT EXISTS annual_spend_current DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_spend_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
ADD COLUMN IF NOT EXISTS lifetime_spend DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tier_upgraded_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS previous_tier_name VARCHAR(50);

-- Set default tier for existing users
UPDATE users 
SET current_tier_name = 'Aether'
WHERE current_tier_name IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(current_tier_id);
CREATE INDEX IF NOT EXISTS idx_users_annual_spend ON users(annual_spend_current);

-- 3. Create Tier History Table
CREATE TABLE IF NOT EXISTS user_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_tier_name VARCHAR(50),
  to_tier_name VARCHAR(50) NOT NULL,
  tier_level_change INTEGER NOT NULL,
  annual_spend_at_change DECIMAL(10, 2),
  reason VARCHAR(100),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tier_history_user ON user_tier_history(user_id);
CREATE INDEX IF NOT EXISTS idx_tier_history_date ON user_tier_history(changed_at);

-- 4. Modify Bookings for EZT Rewards
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS ezt_earned DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ezt_reward_percentage DECIMAL(5, 2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS user_tier_at_booking VARCHAR(50) DEFAULT 'Aether';

-- 5. Update existing users to link to tier
UPDATE users u
SET current_tier_id = lt.id
FROM loyalty_tiers lt
WHERE u.current_tier_name = lt.tier_name
  AND u.current_tier_id IS NULL;

-- 6. Create function to automatically update tier based on spend
CREATE OR REPLACE FUNCTION update_user_tier_on_spend()
RETURNS TRIGGER AS $$
DECLARE
  new_tier RECORD;
  old_tier_name VARCHAR(50);
BEGIN
  -- Get the appropriate tier for the new annual spend
  SELECT * INTO new_tier
  FROM loyalty_tiers
  WHERE min_annual_spend <= NEW.annual_spend_current
    AND (max_annual_spend >= NEW.annual_spend_current OR max_annual_spend IS NULL)
  ORDER BY tier_level DESC
  LIMIT 1;
  
  -- If tier changed, update it
  IF new_tier.tier_name != COALESCE(NEW.current_tier_name, 'Aether') THEN
    old_tier_name := NEW.current_tier_name;
    NEW.current_tier_name := new_tier.tier_name;
    NEW.current_tier_id := new_tier.id;
    NEW.previous_tier_name := old_tier_name;
    NEW.tier_upgraded_at := CURRENT_TIMESTAMP;
    
    -- Record in history
    INSERT INTO user_tier_history (
      user_id, 
      from_tier_name, 
      to_tier_name, 
      tier_level_change, 
      annual_spend_at_change, 
      reason
    ) VALUES (
      NEW.id,
      old_tier_name,
      new_tier.tier_name,
      new_tier.tier_level - COALESCE((SELECT tier_level FROM loyalty_tiers WHERE tier_name = old_tier_name), 1),
      NEW.annual_spend_current,
      'Annual spend threshold reached'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (optional - can be handled in application code instead)
-- DROP TRIGGER IF EXISTS trigger_update_tier_on_spend ON users;
-- CREATE TRIGGER trigger_update_tier_on_spend
--   BEFORE UPDATE OF annual_spend_current ON users
--   FOR EACH ROW
--   WHEN (NEW.annual_spend_current != OLD.annual_spend_current)
--   EXECUTE FUNCTION update_user_tier_on_spend();

-- 7. Add comments for documentation
COMMENT ON TABLE loyalty_tiers IS 'Defines the 5-tier loyalty system tiers';
COMMENT ON COLUMN users.current_tier_name IS 'Current loyalty tier name (Aether, Nova, Luminar, Valiant, Echelon)';
COMMENT ON COLUMN users.annual_spend_current IS 'Total spending in the current calendar year';
COMMENT ON COLUMN users.annual_spend_year IS 'The year for which annual_spend_current applies';
COMMENT ON COLUMN bookings.ezt_earned IS 'EZT tokens earned from this booking based on tier';
COMMENT ON COLUMN bookings.ezt_reward_percentage IS 'The tier reward percentage used for this booking';

