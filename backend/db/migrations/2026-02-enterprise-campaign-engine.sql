-- ============================================
-- Migration: Enterprise Campaign Engine
-- Replaces promotional campaign system.
-- Tier compliant: Ather, Nova, Luminar, Valiant, Echelon only.
-- Backward compatible: does NOT drop existing tables.
-- ============================================

-- Extend campaigns if table exists (from 2026-02-campaign-architecture)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired'));
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS budget_limit DECIMAL(15,2);
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
    -- Migrate start_date/end_date to start_at/end_at if needed
    UPDATE campaigns SET start_at = start_date, end_at = end_date WHERE start_at IS NULL AND start_date IS NOT NULL;
    UPDATE campaigns SET end_at = end_date WHERE end_at IS NULL AND end_date IS NOT NULL;
  END IF;
END $$;

-- Campaign targeting (separate table for flexibility)
CREATE TABLE IF NOT EXISTS campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_tiers TEXT[] DEFAULT '{}',
  target_categories TEXT[] DEFAULT '{}',
  geo_filter JSONB DEFAULT '{}',
  min_reputation_score DECIMAL(5,2),
  user_segment JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);

-- Campaign rules (JSON-driven, no hardcoded logic)
CREATE TABLE IF NOT EXISTS campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  rule_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign ON campaign_rules(campaign_id);

-- campaign_experiences: alias for campaign_experience_mapping (experience_id = offer_id)
CREATE TABLE IF NOT EXISTS campaign_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  experience_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, experience_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_experiences_campaign ON campaign_experiences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_experiences_experience ON campaign_experiences(experience_id);

-- Migrate from campaign_experience_mapping if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_experience_mapping') THEN
    INSERT INTO campaign_experiences (campaign_id, experience_id)
    SELECT campaign_id, offer_id FROM campaign_experience_mapping
    ON CONFLICT (campaign_id, experience_id) DO NOTHING;
  END IF;
END $$;

-- Campaign attribution (for analytics)
CREATE TABLE IF NOT EXISTS campaign_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  user_id UUID,
  experience_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  revenue_generated DECIMAL(15,2) DEFAULT 0,
  reward_issued DECIMAL(15,5) DEFAULT 0,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_attribution_campaign ON campaign_attribution(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_attribution_user ON campaign_attribution(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_attribution_event ON campaign_attribution(event_type);
CREATE INDEX IF NOT EXISTS idx_campaign_attribution_created ON campaign_attribution(created_at DESC);

-- Mark legacy tables as deprecated (comment only; do not drop)
COMMENT ON TABLE campaign_experience_mapping IS 'DEPRECATED: Use campaign_experiences. Kept for backward compatibility.';
