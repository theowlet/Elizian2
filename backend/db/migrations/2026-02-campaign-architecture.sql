-- ============================================
-- Migration: Campaign & Tag Architecture
-- Clean promotional tagging; time-bound campaigns; growth engine.
-- Tier compliant: Ather, Nova, Luminar, Valiant, Echelon only.
-- ============================================

-- Tag types (PROMOTION, CAMPAIGN)
CREATE TABLE IF NOT EXISTS experience_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('PROMOTION', 'CAMPAIGN')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_experience_tags_type ON experience_tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_experience_tags_active ON experience_tags(is_active) WHERE is_active = true;

-- Mapping: offer -> tag (many-to-many)
CREATE TABLE IF NOT EXISTS experience_tag_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES experience_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(offer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_experience_tag_mapping_offer ON experience_tag_mapping(offer_id);
CREATE INDEX IF NOT EXISTS idx_experience_tag_mapping_tag ON experience_tag_mapping(tag_id);

-- Campaigns: time-bound, data-driven
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  banner_image_url VARCHAR(500),
  campaign_type TEXT CHECK (campaign_type IN ('Seasonal', 'Tier Exclusive', 'Geographic', 'Growth Boost', 'Experimental')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  target_tiers TEXT[] DEFAULT '{}',
  target_categories TEXT[] DEFAULT '{}',
  priority_weight INTEGER DEFAULT 0,
  growth_rule JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active) WHERE is_active = true;

-- Mapping: campaign -> offer (many-to-many)
CREATE TABLE IF NOT EXISTS campaign_experience_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_experience_campaign ON campaign_experience_mapping(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_experience_offer ON campaign_experience_mapping(offer_id);

-- Campaign audit trail (immutable)
CREATE TABLE IF NOT EXISTS campaign_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  actor_user_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_audit_campaign ON campaign_audit_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_audit_created ON campaign_audit_log(created_at DESC);

-- Seed default "Trending" tag if not exists
INSERT INTO experience_tags (name, tag_type, description) 
VALUES ('Trending', 'PROMOTION', 'Shown in Trending Experiences section')
ON CONFLICT (name) DO NOTHING;
