-- Featured moderation support for partners and offers

-- Partner eligibility flag
ALTER TABLE IF EXISTS partners
ADD COLUMN IF NOT EXISTS approved_for_featured BOOLEAN DEFAULT false;

-- Offer moderation flags
ALTER TABLE IF EXISTS partner_offers
ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS featured_request_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS forced_by_admin BOOLEAN DEFAULT false;

-- Audit trail for admin/partner actions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);


