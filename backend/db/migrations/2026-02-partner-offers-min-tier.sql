-- Tier-gated offers: min_tier_name (safe to run multiple times)
-- Run this so "Unlock at X" and tier enforcement work for offers.
-- After running: in offerRepository.js add po.min_tier_name to the SELECT in listPublicOffers and getPublicOffersByIds.

ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS min_tier_name VARCHAR(50) DEFAULT NULL;
COMMENT ON COLUMN partner_offers.min_tier_name IS 'Minimum tier required (e.g. Luminar, Echelon); NULL = all tiers';

ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN DEFAULT FALSE;
