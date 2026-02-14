-- ============================================
-- REDEMPTION SYSTEM OVERHAUL
-- Visit sessions, redemption schema extension, dual confirmation
-- ============================================

-- 1. Visit sessions table (one active visit per user per venue)
CREATE TABLE IF NOT EXISTS visit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active',
  check_in_lat DECIMAL(10, 8),
  check_in_lng DECIMAL(11, 8),
  check_in_distance_meters INT,
  geo_verified BOOLEAN DEFAULT false,
  qr_scan_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_sessions_user_partner_active
  ON visit_sessions(user_id, partner_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_visit_sessions_booking ON visit_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_expires ON visit_sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_visit_sessions_partner ON visit_sessions(partner_id);

COMMENT ON TABLE visit_sessions IS 'One active visit per user per venue; links check-in to redemption';

-- 2. Bookings: ensure check-in columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'checked_in_at') THEN
    ALTER TABLE bookings ADD COLUMN checked_in_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'check_in_lat') THEN
    ALTER TABLE bookings ADD COLUMN check_in_lat DECIMAL(10, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'check_in_lng') THEN
    ALTER TABLE bookings ADD COLUMN check_in_lng DECIMAL(11, 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'check_in_distance') THEN
    ALTER TABLE bookings ADD COLUMN check_in_distance INT;
  END IF;
END $$;

-- 3. Extend redemption_audit (additive, nullable for existing rows)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'visit_session_id') THEN
    ALTER TABLE redemption_audit ADD COLUMN visit_session_id UUID REFERENCES visit_sessions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'offer_discount_percentage') THEN
    ALTER TABLE redemption_audit ADD COLUMN offer_discount_percentage DECIMAL(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'discount_amount') THEN
    ALTER TABLE redemption_audit ADD COLUMN discount_amount DECIMAL(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'ezt_tokens_required') THEN
    ALTER TABLE redemption_audit ADD COLUMN ezt_tokens_required DECIMAL(15, 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'customer_confirmation_status') THEN
    ALTER TABLE redemption_audit ADD COLUMN customer_confirmation_status VARCHAR(20) DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'customer_confirmed_at') THEN
    ALTER TABLE redemption_audit ADD COLUMN customer_confirmed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'customer_dispute_reason') THEN
    ALTER TABLE redemption_audit ADD COLUMN customer_dispute_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redemption_audit' AND column_name = 'confirmation_expires_at') THEN
    ALTER TABLE redemption_audit ADD COLUMN confirmation_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- 4. Widen redemption_status CHECK to include new statuses (drop and re-add)
ALTER TABLE redemption_audit DROP CONSTRAINT IF EXISTS redemption_audit_redemption_status_check;
ALTER TABLE redemption_audit ADD CONSTRAINT redemption_audit_redemption_status_check
  CHECK (redemption_status IN ('pending_confirmation', 'redeemed', 'reversed', 'disputed', 'auto_expired'));

-- 5. Index for confirmation expiry job
CREATE INDEX IF NOT EXISTS idx_redemption_audit_confirmation
  ON redemption_audit(customer_confirmation_status, confirmation_expires_at)
  WHERE customer_confirmation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_redemption_audit_visit_session ON redemption_audit(visit_session_id);
