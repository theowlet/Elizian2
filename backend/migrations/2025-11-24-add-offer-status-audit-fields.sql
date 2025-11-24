-- Migration: Add offer_status enum and audit fields
-- Date: 2025-11-24
-- Purpose: Add status column to partner_offers and enhance audit_log

-- ==========================================
-- 1. Create offer_status ENUM type
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status_enum') THEN
    CREATE TYPE offer_status_enum AS ENUM (
      'draft',
      'pending_approval',
      'active',
      'paused',
      'rejected',
      'expired'
    );
    RAISE NOTICE 'Created offer_status_enum type';
  ELSE
    RAISE NOTICE 'offer_status_enum type already exists';
  END IF;
END$$;

-- ==========================================
-- 2. Add status column to partner_offers
-- ==========================================

ALTER TABLE partner_offers 
  ADD COLUMN IF NOT EXISTS status offer_status_enum DEFAULT 'draft';

COMMENT ON COLUMN partner_offers.status IS 'Current status of the offer (draft, pending_approval, active, paused, rejected, expired)';

-- ==========================================
-- 3. Backfill status from existing columns
-- ==========================================

-- Update status based on is_active, start_date, and end_date
UPDATE partner_offers
SET status = CASE
  -- If explicitly inactive, mark as paused
  WHEN is_active = false THEN 'paused'
  -- If end date has passed, mark as expired
  WHEN end_date IS NOT NULL AND end_date < NOW() THEN 'expired'
  -- If start date is in future, keep as draft
  WHEN start_date IS NOT NULL AND start_date > NOW() THEN 'draft'
  -- If active and within date range, mark as active
  WHEN is_active = true THEN 'active'
  -- Default to draft
  ELSE 'draft'
END
WHERE status = 'draft';  -- Only update records that haven't been set

-- ==========================================
-- 4. Add index on status for performance
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_partner_offers_status 
  ON partner_offers(status);

CREATE INDEX IF NOT EXISTS idx_partner_offers_status_active 
  ON partner_offers(status) 
  WHERE status = 'active';

-- ==========================================
-- 5. Enhance audit_log table
-- ==========================================

-- Add actor_name for human-readable actor identification
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255);

COMMENT ON COLUMN audit_log.actor_name IS 'Human-readable name of the actor (e.g., user name, admin name)';

-- Add entity_name for human-readable entity identification
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255);

COMMENT ON COLUMN audit_log.entity_name IS 'Human-readable name of the entity (e.g., offer title, partner name)';

-- Add meta column for structured metadata
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS meta JSONB;

COMMENT ON COLUMN audit_log.meta IS 'Structured metadata about the action (previous values, next values, etc.)';

-- Add index on meta for JSONB queries
CREATE INDEX IF NOT EXISTS idx_audit_log_meta 
  ON audit_log USING GIN(meta);

-- Add index on actor_name and entity_name for search
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_name 
  ON audit_log(actor_name);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity_name 
  ON audit_log(entity_name);

-- ==========================================
-- 6. Ensure created_at has default
-- ==========================================

ALTER TABLE audit_log
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- ==========================================
-- 7. Add trigger to auto-update status on date changes
-- ==========================================

CREATE OR REPLACE FUNCTION auto_update_offer_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-expire if end_date has passed
  IF NEW.end_date IS NOT NULL AND NEW.end_date < NOW() AND NEW.status != 'expired' THEN
    NEW.status := 'expired';
    RAISE NOTICE 'Offer % auto-expired due to end_date', NEW.id;
  END IF;
  
  -- Auto-activate if start_date has arrived and was draft
  IF NEW.start_date IS NOT NULL 
     AND NEW.start_date <= NOW() 
     AND NEW.is_active = true 
     AND NEW.status = 'draft' 
     AND (NEW.end_date IS NULL OR NEW.end_date > NOW()) THEN
    NEW.status := 'active';
    RAISE NOTICE 'Offer % auto-activated due to start_date', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_update_offer_status ON partner_offers;

CREATE TRIGGER trigger_auto_update_offer_status
  BEFORE INSERT OR UPDATE ON partner_offers
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_offer_status();

-- ==========================================
-- 8. Migration verification
-- ==========================================

DO $$
DECLARE
  total_offers INTEGER;
  draft_count INTEGER;
  active_count INTEGER;
  paused_count INTEGER;
  expired_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_offers FROM partner_offers;
  SELECT COUNT(*) INTO draft_count FROM partner_offers WHERE status = 'draft';
  SELECT COUNT(*) INTO active_count FROM partner_offers WHERE status = 'active';
  SELECT COUNT(*) INTO paused_count FROM partner_offers WHERE status = 'paused';
  SELECT COUNT(*) INTO expired_count FROM partner_offers WHERE status = 'expired';
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total offers: %', total_offers;
  RAISE NOTICE '  - Draft: %', draft_count;
  RAISE NOTICE '  - Active: %', active_count;
  RAISE NOTICE '  - Paused: %', paused_count;
  RAISE NOTICE '  - Expired: %', expired_count;
  RAISE NOTICE '================================================';
END$$;

