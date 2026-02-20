-- ============================================
-- DYNAMIC PARTNER TIER SYSTEM
-- Replace ENUM partner_tier with editable partner_tiers table.
-- Gold/Silver/Bronze become default seeded rows; admin can rename, add, delete tiers.
-- ============================================

-- 1. Partner tiers table (fully editable; no ENUM)
CREATE TABLE IF NOT EXISTS partner_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  platform_fee_percent DECIMAL(5, 2) NOT NULL CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  fiat_fee_percent DECIMAL(5, 2) NOT NULL CHECK (fiat_fee_percent >= 0 AND fiat_fee_percent <= 100),
  ezt_fee_percent DECIMAL(5, 2) NOT NULL CHECK (ezt_fee_percent >= 0 AND ezt_fee_percent <= 100),
  CONSTRAINT chk_fee_split CHECK (fiat_fee_percent + ezt_fee_percent = platform_fee_percent),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE partner_tiers IS 'Editable partner subscription tiers; platform fee split into fiat and EZT.';
COMMENT ON COLUMN partner_tiers.platform_fee_percent IS 'Total platform fee % on bill (fiat + ezt).';
COMMENT ON COLUMN partner_tiers.fiat_fee_percent IS 'Fiat component of platform fee %.';
COMMENT ON COLUMN partner_tiers.ezt_fee_percent IS 'EZT component of platform fee %.';

-- 2. Seed default tiers (Gold, Silver, Bronze)
INSERT INTO partner_tiers (name, description, platform_fee_percent, fiat_fee_percent, ezt_fee_percent, is_active)
VALUES
  ('Gold', 'Premium partnership benefits.', 15.00, 10.00, 5.00, true),
  ('Silver', 'Enhanced visibility and support.', 12.00, 8.00, 4.00, true),
  ('Bronze', 'Entry-level partnership.', 10.00, 7.00, 3.00, true)
ON CONFLICT (name) DO NOTHING;

-- 3. Platform earnings ledger (per redemption)
CREATE TABLE IF NOT EXISTS platform_earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  tier_id UUID NOT NULL REFERENCES partner_tiers(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  redemption_id UUID REFERENCES redemption_audit(id) ON DELETE SET NULL,
  bill_amount DECIMAL(12, 2) NOT NULL CHECK (bill_amount >= 0),
  platform_fee_total DECIMAL(12, 2) NOT NULL CHECK (platform_fee_total >= 0),
  fiat_component DECIMAL(12, 2) NOT NULL CHECK (fiat_component >= 0),
  ezt_component DECIMAL(12, 2) NOT NULL CHECK (ezt_component >= 0),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_ledger_created_at ON platform_earnings_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_ledger_partner_id ON platform_earnings_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_ledger_tier_id ON platform_earnings_ledger(tier_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_ledger_redemption_id ON platform_earnings_ledger(redemption_id);

COMMENT ON TABLE platform_earnings_ledger IS 'Platform revenue per redemption; tier_id and fee split stored for reporting.';

-- 4. Add tier_id to partners (keep partner_tier for migration, drop later)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'tier_id') THEN
    ALTER TABLE partners ADD COLUMN tier_id UUID REFERENCES partner_tiers(id) ON DELETE RESTRICT;
    COMMENT ON COLUMN partners.tier_id IS 'Dynamic partner tier (replaces partner_tier ENUM).';
  END IF;
END $$;

-- 5. Backfill tier_id from partner_tier (if column exists), else set Bronze for all without tier
DO $$
DECLARE
  bid UUID; sid UUID; gid UUID;
BEGIN
  SELECT id INTO bid FROM partner_tiers WHERE LOWER(name) = 'bronze' LIMIT 1;
  SELECT id INTO sid FROM partner_tiers WHERE LOWER(name) = 'silver' LIMIT 1;
  SELECT id INTO gid FROM partner_tiers WHERE LOWER(name) = 'gold' LIMIT 1;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'partner_tier') THEN
    UPDATE partners SET tier_id = COALESCE(
      CASE WHEN LOWER(TRIM(partner_tier)) = 'gold' THEN gid WHEN LOWER(TRIM(partner_tier)) = 'silver' THEN sid ELSE bid END,
      bid
    ) WHERE tier_id IS NULL;
  ELSE
    UPDATE partners SET tier_id = bid WHERE tier_id IS NULL AND bid IS NOT NULL;
  END IF;
END $$;

-- 6. Set default tier_id for new partners (Bronze) via dynamic SQL (DEFAULT cannot use a variable)
DO $$
DECLARE
  bid UUID;
BEGIN
  SELECT id INTO bid FROM partner_tiers WHERE LOWER(name) = 'bronze' LIMIT 1;
  IF bid IS NOT NULL THEN
    EXECUTE format('ALTER TABLE partners ALTER COLUMN tier_id SET DEFAULT %L', bid);
  END IF;
END $$;

-- 7. Drop legacy ENUM constraint and column (optional: drop partner_tier after backfill)
DO $$
BEGIN
  ALTER TABLE partners DROP CONSTRAINT IF EXISTS chk_partner_tier;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'partner_tier') THEN
    ALTER TABLE partners DROP COLUMN partner_tier;
  END IF;
END $$;
