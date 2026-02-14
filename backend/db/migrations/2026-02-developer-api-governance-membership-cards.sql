-- Phase 3 pending features: Developer API, Governance, Membership Cards
-- Run once; idempotent where possible.

-- 1) Developer API Platform: API keys for third-party access
CREATE TABLE IF NOT EXISTS developer_api_keys (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(128) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  scopes JSONB DEFAULT '["vouchers:validate", "loyalty:read"]',
  rate_limit_per_min INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key_prefix)
);
CREATE INDEX IF NOT EXISTS idx_developer_api_keys_user_id ON developer_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_developer_api_keys_prefix ON developer_api_keys(key_prefix) WHERE is_active = true;

-- 2) Community Governance: proposals and votes (Phase 3 #18)
CREATE TABLE IF NOT EXISTS governance_proposals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  options JSONB NOT NULL DEFAULT '[]',  -- e.g. ["Option A", "Option B"]
  voting_ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'open',  -- open, closed, cancelled
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS governance_votes (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  weight DECIMAL(20, 4) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(proposal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_status ON governance_proposals(status);

-- 3) NFT-style membership cards per venue (Phase 3 #17) – digital collectible, no blockchain
CREATE TABLE IF NOT EXISTS user_venue_membership_cards (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  card_type VARCHAR(100) DEFAULT 'default',
  earned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, partner_id)
);
CREATE INDEX IF NOT EXISTS idx_user_venue_membership_cards_user ON user_venue_membership_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_membership_cards_partner ON user_venue_membership_cards(partner_id);
