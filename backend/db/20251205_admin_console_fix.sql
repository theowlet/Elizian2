-- Admin console schema fixes

-- 1. partner_offers.status with enum semantics
ALTER TABLE partner_offers
ADD COLUMN IF NOT EXISTS status VARCHAR(20)
  CHECK (status IN ('draft','pending_approval','active','paused','rejected','expired'))
  DEFAULT 'draft';

-- 2. partners.status for backend workflows
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS status VARCHAR(20)
  DEFAULT 'active';

-- 3. audit_log descriptive fields
ALTER TABLE audit_log
ADD COLUMN IF NOT EXISTS actor_name TEXT,
ADD COLUMN IF NOT EXISTS entity_name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_offers_status ON partner_offers(status);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);

