-- ============================================
-- Migration: Promotional Category Cleanup
-- Single promotional category = Trending only.
-- Featured, Premium, Handpicked removed from UI/API.
-- ============================================
-- NOTE: partner_offers has no promotional_category column.
-- Promotional visibility uses is_trending boolean only.
-- If a future schema adds promotional_category, run:
--   UPDATE partner_offers SET promotional_category = 'Trending'
--   WHERE promotional_category IN ('Featured','Premium','Handpicked');
-- ============================================

-- Clarify is_trending column comment (remove "featured" wording)
COMMENT ON COLUMN partner_offers.is_trending IS 'Whether this offer is trending. Single promotional flag; shown in Trending Experiences section.';
