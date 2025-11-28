-- ============================================
-- Migration: Consolidate is_promoted to is_trending
-- Remove redundant is_promoted column and standardize on is_trending
-- ============================================

-- Step 1: Migrate any is_promoted=true values to is_trending=true
UPDATE partner_offers 
SET is_trending = true 
WHERE is_promoted = true AND is_trending = false;

-- Step 2: Drop the is_promoted column
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'partner_offers' AND column_name = 'is_promoted'
  ) THEN
    ALTER TABLE partner_offers DROP COLUMN is_promoted;
    RAISE NOTICE 'Dropped is_promoted column from partner_offers table';
  ELSE
    RAISE NOTICE 'is_promoted column does not exist in partner_offers (may already be removed)';
  END IF;
END $$;

-- Step 3: Ensure is_trending has proper index
DROP INDEX IF EXISTS idx_partner_offers_promoted;
CREATE INDEX IF NOT EXISTS idx_partner_offers_trending ON partner_offers(is_trending) WHERE is_trending = true;

-- Step 4: Update any views or functions that reference is_promoted
-- (Add any custom views/functions here if they exist)

COMMENT ON COLUMN partner_offers.is_trending IS 'Whether this offer is featured/trending. Set by admin to highlight deals in the trending section.';

