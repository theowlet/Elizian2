-- Trending flow by partner tier (Gold/Silver/Bronze)
-- Gold: all deals auto-trending
-- Silver: partner can request, admin approves with reason
-- Bronze: cannot request; admin can override

ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS trending_approval_reason TEXT;
COMMENT ON COLUMN partner_offers.trending_approval_reason IS 'Admin note when approving a Silver partner trending request';
