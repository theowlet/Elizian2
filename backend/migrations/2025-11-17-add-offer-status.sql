-- Migration: Add canonical status enum to partner_offers
-- Date: 2025-11-17
-- Purpose: Stabilize deal approval workflow with explicit status field

BEGIN;

-- 1. Add enum type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
    CREATE TYPE offer_status AS ENUM ('draft', 'pending_approval', 'active', 'paused', 'rejected', 'expired');
  END IF;
END$$;

-- 2. Add column with default draft
ALTER TABLE partner_offers
  ADD COLUMN IF NOT EXISTS status offer_status DEFAULT 'draft';

-- 3. Backfill status from existing columns
UPDATE partner_offers
SET status =
  CASE
    WHEN is_active = true THEN 'active'
    WHEN is_active = false AND featured_request_pending = true THEN 'pending_approval'
    WHEN end_date IS NOT NULL AND end_date < (NOW() AT TIME ZONE 'UTC') THEN 'expired'
    WHEN start_date IS NOT NULL AND start_date > (NOW() AT TIME ZONE 'UTC') THEN 'pending_approval'
    WHEN start_date IS NULL AND is_active = false THEN 'draft'
    ELSE COALESCE(status, 'draft')
  END;

-- 4. Create index for quick filtering
CREATE INDEX IF NOT EXISTS idx_partner_offers_status ON partner_offers (status);

-- 5. Add comment
COMMENT ON COLUMN partner_offers.status IS 'Canonical offer status: draft, pending_approval, active, paused, rejected, expired';

COMMIT;

