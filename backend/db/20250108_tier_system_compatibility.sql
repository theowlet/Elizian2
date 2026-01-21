-- ============================================
-- TIER SYSTEM COMPATIBILITY MIGRATION
-- ============================================
-- This migration ensures backward compatibility and adds missing fields
-- from the proposed tier system while maintaining existing structure

-- 1. Ensure loyalty_tiers table exists (from previous migration)
-- If it doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loyalty_tiers') THEN
    CREATE TABLE loyalty_tiers (
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
    ('Aether', 1, 0, 9999.99, 1.00, '#94a3b8', '⭐', '{"description": "Entry level tier", "perks": ["1% EZT rewards", "Access to basic deals"]}'::jsonb),
    ('Nova', 2, 10000.00, 49999.99, 2.00, '#3b82f6', '💎', '{"description": "Silver tier", "perks": ["2% EZT rewards", "Priority support", "1 free cancellation per month"]}'::jsonb),
    ('Luminar', 3, 50000.00, 149999.99, 3.00, '#8b5cf6', '👑', '{"description": "Gold tier", "perks": ["3% EZT rewards", "Priority support", "Exclusive deals", "2 free cancellations per month", "Birthday bonus EZT"]}'::jsonb),
    ('Valiant', 4, 150000.00, 499999.99, 4.00, '#f59e0b', '🏆', '{"description": "Platinum tier", "perks": ["4% EZT rewards", "Priority support", "Exclusive deals", "VIP events", "5 free cancellations per month", "Birthday & anniversary bonuses"]}'::jsonb),
    ('Echelon', 5, 500000.00, NULL, 5.00, '#ef4444', '🔥', '{"description": "Elite tier", "perks": ["5% EZT rewards", "Dedicated account manager", "VIP event invitations", "Complimentary upgrades", "10 free cancellations per month", "Lifetime tier retention", "Exclusive partner perks"]}'::jsonb)
    ON CONFLICT (tier_name) DO NOTHING;

    CREATE INDEX IF NOT EXISTS idx_tiers_level ON loyalty_tiers(tier_level);
    CREATE INDEX IF NOT EXISTS idx_tiers_spend_range ON loyalty_tiers(min_annual_spend, max_annual_spend);
  END IF;
END $$;

-- 2. Add compatibility fields to users table (if they don't exist)
-- These provide backward compatibility with the proposed schema
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES loyalty_tiers(id),
  ADD COLUMN IF NOT EXISTS current_tier_name VARCHAR(50) DEFAULT 'Aether',
  ADD COLUMN IF NOT EXISTS annual_spend_current DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_spend_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS lifetime_spend DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_upgraded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS previous_tier_name VARCHAR(50);

-- Create compatibility view for proposed field names
-- This allows code to use tier, tier_annual_spend, tier_year, previous_tier
CREATE OR REPLACE VIEW user_tier_compat AS
SELECT 
  id,
  current_tier_name AS tier,
  annual_spend_current AS tier_annual_spend,
  annual_spend_year AS tier_year,
  tier_upgraded_at,
  previous_tier_name AS previous_tier,
  current_tier_id,
  lifetime_spend
FROM users;

-- 3. Ensure user_tier_history table exists (from previous migration)
-- If it doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_tier_history') THEN
    CREATE TABLE user_tier_history (
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
  END IF;
END $$;

-- 4. Create tier_history view for compatibility (maps to user_tier_history)
CREATE OR REPLACE VIEW tier_history AS
SELECT 
  id,
  user_id,
  from_tier_name AS previous_tier,
  to_tier_name AS new_tier,
  annual_spend_at_change AS annual_spend,
  EXTRACT(YEAR FROM changed_at)::INT AS year,
  changed_at AS upgraded_at
FROM user_tier_history;

-- 5. Create tier_benefits view for compatibility (maps to loyalty_tiers)
CREATE OR REPLACE VIEW tier_benefits AS
SELECT 
  id,
  tier_name AS tier,
  min_annual_spend AS min_spend,
  max_annual_spend AS max_spend,
  ezt_reward_percentage,
  CASE 
    WHEN tier_level >= 3 THEN true 
    ELSE false 
  END AS priority_support,
  CASE 
    WHEN tier_level >= 3 THEN true 
    ELSE false 
  END AS exclusive_deals,
  CASE 
    WHEN tier_level >= 4 THEN true 
    ELSE false 
  END AS early_access,
  CASE 
    WHEN tier_name = 'Nova' THEN 1
    WHEN tier_name = 'Luminar' THEN 2
    WHEN tier_name = 'Valiant' THEN 5
    WHEN tier_name = 'Echelon' THEN 10
    ELSE 0
  END AS free_cancellations,
  tier_level AS tier_order,
  created_at
FROM loyalty_tiers;

-- 6. Create trigger to keep tier fields in sync (for backward compatibility)
-- This ensures that if code writes to tier, it updates current_tier_name
CREATE OR REPLACE FUNCTION sync_tier_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If current_tier_name is updated, ensure current_tier_id is set
  IF NEW.current_tier_name IS NOT NULL AND NEW.current_tier_name != COALESCE(OLD.current_tier_name, '') THEN
    SELECT id INTO NEW.current_tier_id
    FROM loyalty_tiers
    WHERE tier_name = NEW.current_tier_name
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_tier_fields ON users;
CREATE TRIGGER trigger_sync_tier_fields
  BEFORE UPDATE OF current_tier_name ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_tier_fields();

-- 7. Set default tier for existing users
UPDATE users 
SET current_tier_name = 'Aether',
    current_tier_id = (SELECT id FROM loyalty_tiers WHERE tier_name = 'Aether' LIMIT 1)
WHERE current_tier_name IS NULL;

-- 8. Link existing users to tier
UPDATE users u
SET current_tier_id = lt.id
FROM loyalty_tiers lt
WHERE u.current_tier_name = lt.tier_name
  AND u.current_tier_id IS NULL;

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(current_tier_id);
CREATE INDEX IF NOT EXISTS idx_users_tier_name ON users(current_tier_name);
CREATE INDEX IF NOT EXISTS idx_users_annual_spend ON users(annual_spend_current);
CREATE INDEX IF NOT EXISTS idx_users_tier_year ON users(annual_spend_year);

-- 10. Add comments for documentation
COMMENT ON COLUMN users.current_tier_name IS 'Current loyalty tier name (Aether, Nova, Luminar, Valiant, Echelon). Use this field for tier name.';
COMMENT ON COLUMN users.annual_spend_current IS 'Total spending in the current calendar year. Use this field for annual spend.';
COMMENT ON COLUMN users.annual_spend_year IS 'The year for which annual_spend_current applies. Use this field for tier year.';
COMMENT ON COLUMN users.previous_tier_name IS 'Previous tier name before upgrade. Use this field for previous_tier.';
COMMENT ON VIEW user_tier_compat IS 'Compatibility view mapping new field names to proposed field names (tier, tier_annual_spend, tier_year, previous_tier)';
COMMENT ON VIEW tier_history IS 'Compatibility view mapping user_tier_history to tier_history';
COMMENT ON VIEW tier_benefits IS 'Compatibility view mapping loyalty_tiers to tier_benefits';

