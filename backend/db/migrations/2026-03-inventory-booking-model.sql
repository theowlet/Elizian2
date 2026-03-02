-- ============================================================
-- INVENTORY Booking Model Migration
-- Dynamic Expiry + EZT Token Locking + Temp Seat Reservation
-- ============================================================
-- This migration is additive and zero-downtime safe.
-- Supports the new INVENTORY category for Events (future: Hotels, Flights, Premium).
-- SERVICE categories (Dining, Spa, Wellness, Healthcare, Travel, Others) are UNCHANGED.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1A. New Table: token_locks
-- Holds EZT tokens without modifying available_tokens.
-- At redemption, redeemTokens() does the actual deduction.
-- At expiry/cancel, mark as released — nothing to refund.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  locked_amount DECIMAL(15,5) NOT NULL CHECK (locked_amount > 0),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'locked'
    CHECK (status IN ('locked', 'consumed', 'released')),
  consumed_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  release_reason VARCHAR(50) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_token_locks_user_active
  ON token_locks(user_id) WHERE status = 'locked';

CREATE INDEX IF NOT EXISTS idx_token_locks_expires
  ON token_locks(expires_at) WHERE status = 'locked';


-- ──────────────────────────────────────────────────────────────
-- 1B. New Columns on bookings
-- ──────────────────────────────────────────────────────────────

-- booking_category: SERVICE | INVENTORY (future: HOTEL, FLIGHT, PREMIUM)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'booking_category'
  ) THEN
    ALTER TABLE bookings ADD COLUMN booking_category VARCHAR(20) NULL;
    RAISE NOTICE 'Added booking_category column to bookings';
  END IF;
END $$;

-- reservation_expires_at: dynamic expiry for INVENTORY bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'reservation_expires_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN reservation_expires_at TIMESTAMPTZ NULL;
    RAISE NOTICE 'Added reservation_expires_at column to bookings';
  END IF;
END $$;

-- EZT locked amounts (separate from ezt_redeemed which is actual spend)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'ezt_locked'
  ) THEN
    ALTER TABLE bookings ADD COLUMN ezt_locked DECIMAL(15,5) DEFAULT 0;
    RAISE NOTICE 'Added ezt_locked column to bookings';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'ezt_locked_inr'
  ) THEN
    ALTER TABLE bookings ADD COLUMN ezt_locked_inr DECIMAL(12,2) DEFAULT 0;
    RAISE NOTICE 'Added ezt_locked_inr column to bookings';
  END IF;
END $$;

-- Full pricing snapshot frozen at booking time (JSONB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'pricing_snapshot'
  ) THEN
    ALTER TABLE bookings ADD COLUMN pricing_snapshot JSONB NULL;
    RAISE NOTICE 'Added pricing_snapshot column to bookings';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1C. Widen bookings.status CHECK to include temp_reserved
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending','payment_pending','temp_reserved','confirmed','cancelled','redeemed','expired','refunded'));
  RAISE NOTICE 'Widened status CHECK to include temp_reserved';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update status CHECK constraint: %', SQLERRM;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1D. System Settings for Dynamic Expiry + Max Reservations
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings') THEN
    INSERT INTO system_settings (id, setting_key, setting_value, description) VALUES
      (gen_random_uuid(), 'inventory_default_expiry_hours', '24', 'Hours before INVENTORY reservation expires when event is >24h away'),
      (gen_random_uuid(), 'inventory_cutoff_minutes_before_event', '60', 'Minutes before event start when bookings are rejected'),
      (gen_random_uuid(), 'inventory_ezt_lock_enabled', 'true', 'Whether to lock EZT tokens for INVENTORY bookings'),
      (gen_random_uuid(), 'max_inventory_reservations_per_user', '3', 'Max simultaneous temp_reserved bookings per user')
    ON CONFLICT (setting_key) DO NOTHING;
    RAISE NOTICE 'Inserted INVENTORY system settings';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1E. Performance Indexes
-- ──────────────────────────────────────────────────────────────

-- For cron job: find expired temp_reserved bookings
CREATE INDEX IF NOT EXISTS idx_bookings_temp_reserved_expiry
  ON bookings(reservation_expires_at)
  WHERE status = 'temp_reserved';

-- For max reservation count check per user
CREATE INDEX IF NOT EXISTS idx_bookings_user_temp_reserved
  ON bookings(user_id)
  WHERE status = 'temp_reserved';


-- ──────────────────────────────────────────────────────────────
-- 1F. Instant Booking Settings (walk-in / last-minute)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings') THEN
    INSERT INTO system_settings (id, setting_key, setting_value, description) VALUES
      (gen_random_uuid(), 'inventory_allow_instant_booking', 'false', 'Allow event bookings after the normal cutoff window (walk-in / last-minute)'),
      (gen_random_uuid(), 'inventory_instant_booking_expiry_minutes', '15', 'Minutes before an instant booking reservation expires')
    ON CONFLICT (setting_key) DO NOTHING;
    RAISE NOTICE 'Inserted instant booking system settings';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- Done
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '=== INVENTORY Booking Model migration complete ===';
END $$;
