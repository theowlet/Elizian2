-- ============================================
-- Migration: Rename is_promoted to is_trending
-- Run this script to update existing database
-- ============================================

-- Rename column in partner_offers table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'partner_offers' AND column_name = 'is_promoted'
  ) THEN
    ALTER TABLE partner_offers RENAME COLUMN is_promoted TO is_trending;
    RAISE NOTICE 'Renamed is_promoted to is_trending in partner_offers table';
  ELSE
    RAISE NOTICE 'is_promoted column does not exist in partner_offers (may already be renamed)';
  END IF;
END $$;

-- Rename column in menu_items table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'menu_items' AND column_name = 'is_promoted'
  ) THEN
    ALTER TABLE menu_items RENAME COLUMN is_promoted TO is_trending;
    RAISE NOTICE 'Renamed is_promoted to is_trending in menu_items table';
  ELSE
    RAISE NOTICE 'is_promoted column does not exist in menu_items (may already be renamed)';
  END IF;
END $$;

-- Rename indexes
DROP INDEX IF EXISTS idx_partner_offers_promoted;
DROP INDEX IF EXISTS idx_menu_items_promoted;

CREATE INDEX IF NOT EXISTS idx_partner_offers_trending ON partner_offers(is_trending);
CREATE INDEX IF NOT EXISTS idx_menu_items_trending ON menu_items(is_trending);

