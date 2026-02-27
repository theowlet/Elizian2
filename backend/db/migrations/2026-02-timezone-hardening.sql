-- ============================================
-- TIMEZONE HARDENING — NON-BREAKING MIGRATIONS
-- ============================================
-- Date: 2026-02
-- Purpose: Add timezone context columns; prepare for TIMESTAMPTZ adoption.
-- RULES: No DROP, no ALTER of existing timestamp columns that could shift data.
-- Assumption: Historic TIMESTAMP values were stored in session TZ (UTC or IST).
-- ============================================

BEGIN;

-- 1. Add partners.timezone (IANA) — default Asia/Kolkata for India
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE partners ADD COLUMN timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';
    COMMENT ON COLUMN partners.timezone IS 'IANA timezone (e.g. Asia/Kolkata) for operating hours and deal validity';
  END IF;
END $$;

-- 2. Add users.timezone (nullable) — for display preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE users ADD COLUMN timezone VARCHAR(50);
    COMMENT ON COLUMN users.timezone IS 'User preferred IANA timezone for display (nullable)';
  END IF;
END $$;

-- 3. Ensure booked_at_client exists (TIMESTAMPTZ) — already in 2026-02-booked-at-client.sql
-- Included here for completeness; no-op if already applied
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_at_client TIMESTAMPTZ;

-- 4. NO conversion of existing TIMESTAMP columns to TIMESTAMPTZ in this migration.
-- Reason: Stored values may be session-local (IST or UTC). Converting without
-- explicit assumption could shift times incorrectly. A separate, audited migration
-- with data validation can be run after confirming stored value semantics.

COMMIT;

-- ============================================
-- REVERSAL SCRIPT (for rollback)
-- ============================================
-- ALTER TABLE partners DROP COLUMN IF EXISTS timezone;
-- ALTER TABLE users DROP COLUMN IF EXISTS timezone;
-- (booked_at_client: keep for backward compatibility)
