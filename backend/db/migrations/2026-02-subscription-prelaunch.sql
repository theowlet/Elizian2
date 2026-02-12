-- Subscription passes (e.g. Wellness Wednesday, prepaid externally, redeem via code)
CREATE TABLE IF NOT EXISTS subscription_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
  description TEXT,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_passes_partner ON subscription_passes(partner_id);

CREATE TABLE IF NOT EXISTS user_subscription_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_pass_id UUID NOT NULL REFERENCES subscription_passes(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL,
  redeemed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_subscription_passes_user ON user_subscription_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscription_passes_code ON user_subscription_passes(code);

-- Venue pre-launch / founding member signups
CREATE TABLE IF NOT EXISTS venue_prelaunch_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_prelaunch_partner ON venue_prelaunch_signups(partner_id);
CREATE INDEX IF NOT EXISTS idx_prelaunch_user ON venue_prelaunch_signups(user_id);

COMMENT ON TABLE subscription_passes IS 'Subscription pass products (e.g. Morning Chai Pass)';
COMMENT ON TABLE user_subscription_passes IS 'User-owned pass instances; redeemed_at set when venue redeems';
COMMENT ON TABLE venue_prelaunch_signups IS 'Users who signed up for venue pre-launch / founding member';

-- Optional: seed one sample pass product (run once)
INSERT INTO subscription_passes (name, description, is_active) 
SELECT 'Sample Pass', 'Example subscription pass. Create more via admin or SQL.', true
WHERE NOT EXISTS (SELECT 1 FROM subscription_passes LIMIT 1);
