-- Partner subscription tier (Elizian ↔ Partner relationship).
-- Bronze / Silver / Gold: benefits from platform; set by Elizian (admin).
-- Not per-venue guest tiers; this is the partner's tier with the platform.
-- NO CLASH with user loyalty tiers: user tiers are in users.current_tier_name + loyalty_tiers (Ather, Nova, Luminar, Valiant, Echelon). Partner tier is partners.partner_tier (bronze, silver, gold) only.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS partner_tier VARCHAR(20) DEFAULT 'bronze';
COMMENT ON COLUMN partners.partner_tier IS 'Subscription tier with Elizian: bronze, silver, gold. Defines benefits from platform.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_partner_tier') THEN
    ALTER TABLE partners ADD CONSTRAINT chk_partner_tier
      CHECK (partner_tier IS NULL OR partner_tier IN ('bronze', 'silver', 'gold'));
  END IF;
END $$;
