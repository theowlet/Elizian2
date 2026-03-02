-- ============================================
-- EVENT PAYMENT CONFIRMATION WORKFLOW
-- Adds payment_pending state for event bookings
-- Platform does NOT process payments — only records
-- partner's confirmation that payment was received.
-- ============================================

BEGIN;

-- 1. payment_deadline: dynamic deadline for event payment confirmation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_deadline'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_deadline TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ Added payment_deadline column';
  END IF;
END $$;

-- 2. confirmed_at: when partner confirmed payment received
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN confirmed_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ Added confirmed_at column';
  END IF;
END $$;

-- 3. expired_at: when auto-expiry job marked booking expired
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'expired_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN expired_at TIMESTAMPTZ NULL;
    RAISE NOTICE '✅ Added expired_at column';
  END IF;
END $$;

-- 4. cancelled_by: who initiated cancellation ('user' | 'partner' | 'system')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'cancelled_by'
  ) THEN
    ALTER TABLE bookings ADD COLUMN cancelled_by VARCHAR(20) NULL;
    ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('user', 'partner', 'system'));
    RAISE NOTICE '✅ Added cancelled_by column with CHECK constraint';
  END IF;
END $$;

-- 5. payment_proof_url: optional proof of payment uploaded by partner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_proof_url'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_proof_url TEXT NULL;
    RAISE NOTICE '✅ Added payment_proof_url column';
  END IF;
END $$;

-- 6. confirmed_by_partner_user_id: which partner user confirmed payment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'confirmed_by_partner_user_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN confirmed_by_partner_user_id UUID NULL;
    RAISE NOTICE '✅ Added confirmed_by_partner_user_id column';
  END IF;
END $$;

-- 7. platform_handles_payment: legal flag (always false for this platform)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'platform_handles_payment'
  ) THEN
    ALTER TABLE bookings ADD COLUMN platform_handles_payment BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE '✅ Added platform_handles_payment column';
  END IF;
END $$;

-- 8. Widen booking status CHECK constraint to include 'payment_pending'
-- Current: ('pending', 'confirmed', 'cancelled', 'redeemed', 'expired', 'refunded')
-- New:     ('pending', 'payment_pending', 'confirmed', 'cancelled', 'redeemed', 'expired', 'refunded')
DO $$
BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'redeemed', 'expired', 'refunded'));
  RAISE NOTICE '✅ Widened status CHECK constraint to include payment_pending';
END $$;

-- 9. Performance index for auto-expiry cron job
-- Partial index: only payment_pending bookings with a deadline
CREATE INDEX IF NOT EXISTS idx_bookings_payment_pending_expiry
  ON bookings(payment_deadline)
  WHERE status = 'payment_pending';

-- 10. Composite index for partner booking queries by status
CREATE INDEX IF NOT EXISTS idx_bookings_partner_status_date
  ON bookings(partner_id, status, booking_date DESC);

-- 11. Event payment config in system_settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    INSERT INTO system_settings (setting_key, setting_value, description)
    VALUES
      ('event_payment_window_hours', '12', 'Default payment window for event bookings (hours). User must complete payment within this window.'),
      ('event_safety_buffer_hours', '2', 'Safety buffer before event start time (hours). Bookings blocked within this window.'),
      ('event_waitlist_acceptance_minutes', '30', 'Waitlist promotion acceptance window (minutes). Promoted user must complete payment within this time.')
    ON CONFLICT (setting_key) DO NOTHING;
    RAISE NOTICE '✅ Inserted event payment config into system_settings';
  ELSE
    RAISE NOTICE '⚠️ system_settings table not found — config values will use code defaults';
  END IF;
END $$;

COMMIT;
