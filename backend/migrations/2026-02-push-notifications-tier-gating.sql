-- Push Notification Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Tier-gated offers: add min_tier column to partner_offers
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS min_tier_name VARCHAR(50) DEFAULT NULL;
-- NULL means open to all tiers; 'Nova', 'Luminar', 'Valiant', 'Echelon' gates access

-- Add exclusive_experience flag
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN DEFAULT FALSE;

-- Add secret_menu_unlocked tracking per user-offer
CREATE TABLE IF NOT EXISTS user_unlocked_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  unlock_reason VARCHAR(100) DEFAULT 'tier_qualified',
  UNIQUE(user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_user_unlocked_exp_user ON user_unlocked_experiences(user_id);

-- Enhanced recommendation tracking
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  cuisine_preferences TEXT[] DEFAULT '{}',
  preferred_occasions TEXT[] DEFAULT '{}',
  preferred_time_of_day VARCHAR(20) DEFAULT NULL, -- morning, afternoon, evening, night
  price_range VARCHAR(20) DEFAULT NULL, -- budget, mid, premium, luxury
  dietary_restrictions TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- Gallery images for partners
ALTER TABLE partners ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT NULL;
