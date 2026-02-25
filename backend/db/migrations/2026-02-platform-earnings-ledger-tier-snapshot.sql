-- Tier snapshot on platform_earnings_ledger so historical rows are immune to tier renames/fee changes.
-- Platform fee is calculated at transaction time on fiat only; this stores the tier state at that moment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_earnings_ledger' AND column_name = 'tier_name') THEN
    ALTER TABLE platform_earnings_ledger ADD COLUMN tier_name VARCHAR(100);
    COMMENT ON COLUMN platform_earnings_ledger.tier_name IS 'Tier name at transaction time (snapshot).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_earnings_ledger' AND column_name = 'tier_percentage') THEN
    ALTER TABLE platform_earnings_ledger ADD COLUMN tier_percentage DECIMAL(5, 2);
    COMMENT ON COLUMN platform_earnings_ledger.tier_percentage IS 'Platform fee % at transaction time (snapshot).';
  END IF;
END $$;

-- Backfill from partner_tiers for existing rows
UPDATE platform_earnings_ledger pel
SET
  tier_name = pt.name,
  tier_percentage = pt.platform_fee_percent
FROM partner_tiers pt
WHERE pel.tier_id = pt.id
  AND (pel.tier_name IS NULL OR pel.tier_percentage IS NULL);
