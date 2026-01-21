-- Add status column to partner_offers to replace implicit boolean workflow
ALTER TABLE partner_offers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Backfill existing rows based on previous is_active/end_date values
UPDATE partner_offers
SET status = CASE
  WHEN status IS NOT NULL THEN status
  WHEN is_active = true AND (end_date IS NULL OR end_date >= NOW()) THEN 'active'
  WHEN is_active = true AND end_date < NOW() THEN 'expired'
  WHEN is_active = false AND (end_date IS NULL OR end_date >= NOW()) THEN 'pending_approval'
  WHEN is_active = false AND end_date < NOW() THEN 'expired'
  ELSE 'draft'
END;

ALTER TABLE partner_offers
ALTER COLUMN status SET NOT NULL,
ADD CONSTRAINT partner_offers_status_check
  CHECK (status IN ('draft', 'pending_approval', 'active', 'paused', 'rejected', 'expired'));

CREATE INDEX IF NOT EXISTS idx_partner_offers_status ON partner_offers(status);

