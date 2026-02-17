-- Operating Hours, Waitlist & Echelon Override Migration
-- Date: 2026-02-14
-- Purpose: Add operating hours enforcement, waitlist system, Echelon capacity override

-- ============================================
-- PART 1: OPERATING HOURS ENHANCEMENTS
-- ============================================

-- Add break periods to existing partner_hours table
ALTER TABLE partner_hours ADD COLUMN IF NOT EXISTS break_start TIME;
ALTER TABLE partner_hours ADD COLUMN IF NOT EXISTS break_end TIME;

-- Add "not accepting bookings" toggle to partners table
ALTER TABLE partners ADD COLUMN IF NOT EXISTS accepting_bookings BOOLEAN DEFAULT TRUE;
COMMENT ON COLUMN partners.accepting_bookings IS 'Partner can temporarily pause all bookings without closing venue';

-- Create special closures table (holidays, temp closures)
CREATE TABLE IF NOT EXISTS partner_special_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL,
  closure_reason TEXT,
  is_full_day BOOLEAN DEFAULT TRUE,
  custom_opens_at TIME,
  custom_closes_at TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  UNIQUE(partner_id, closure_date)
);

CREATE INDEX IF NOT EXISTS idx_special_closures_partner_date
ON partner_special_closures(partner_id, closure_date);

CREATE INDEX IF NOT EXISTS idx_special_closures_upcoming
ON partner_special_closures(closure_date)
WHERE closure_date >= CURRENT_DATE;

-- ============================================
-- PART 2: WAITLIST SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS booking_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size > 0 AND party_size <= 50),
  user_tier VARCHAR(50),
  position INTEGER NOT NULL,
  estimated_wait_minutes INTEGER,
  status VARCHAR(50) DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'confirmed', 'expired', 'cancelled')),
  notified_at TIMESTAMP,
  expires_at TIMESTAMP, -- 10 min confirmation window
  special_requests TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for waitlist
CREATE INDEX IF NOT EXISTS idx_waitlist_partner_datetime
ON booking_waitlist(partner_id, booking_date, booking_time);

CREATE INDEX IF NOT EXISTS idx_waitlist_user
ON booking_waitlist(user_id, status);

CREATE INDEX IF NOT EXISTS idx_waitlist_status_active
ON booking_waitlist(status, created_at)
WHERE status IN ('waiting', 'notified');

CREATE INDEX IF NOT EXISTS idx_waitlist_position
ON booking_waitlist(partner_id, booking_date, booking_time, position, status)
WHERE status = 'waiting';

-- ============================================
-- PART 3: ECHELON OVERRIDE TRACKING
-- ============================================

-- Add override tracking to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_priority_override BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS override_reason TEXT;

COMMENT ON COLUMN bookings.is_priority_override IS 'True if Echelon tier was used to override capacity limits';
COMMENT ON COLUMN bookings.override_reason IS 'Explanation of override (e.g., "Echelon tier capacity override")';

-- Add Echelon buffer configuration to partners (optional future enhancement)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS allow_echelon_override BOOLEAN DEFAULT TRUE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS echelon_capacity_buffer_percent DECIMAL(5,2) DEFAULT 10.0 CHECK (echelon_capacity_buffer_percent >= 0 AND echelon_capacity_buffer_percent <= 50);

COMMENT ON COLUMN partners.allow_echelon_override IS 'Whether to allow Echelon tier to override capacity (globally enabled, but partners can opt-out)';
COMMENT ON COLUMN partners.echelon_capacity_buffer_percent IS 'Percentage buffer for Echelon override (default: 10%)';

-- ============================================
-- PART 4: RESTAURANT_AVAILABILITY ENHANCEMENTS
-- ============================================

-- Add reason for blocking (already exists, just adding comment)
COMMENT ON COLUMN restaurant_availability.block_reason IS 'Reason for blocking slot (e.g., "Private event", "Maintenance", "Staff shortage")';

-- Add index for partner dashboard queries
CREATE INDEX IF NOT EXISTS idx_availability_partner_date_range
ON restaurant_availability(partner_id, date)
WHERE is_available = TRUE AND date >= CURRENT_DATE;

-- ============================================
-- PART 5: PERFORMANCE INDEXES
-- ============================================

-- Index for booking time validation queries
CREATE INDEX IF NOT EXISTS idx_partner_hours_day
ON partner_hours(partner_id, day_of_week, is_closed);

-- Index for Echelon override queries
CREATE INDEX IF NOT EXISTS idx_bookings_override
ON bookings(is_priority_override, partner_id, booking_date)
WHERE is_priority_override = TRUE;

-- ============================================
-- PART 6: SEED DEFAULT OPERATING HOURS
-- ============================================

-- For existing partners without hours, create default 9 AM - 9 PM, 7 days
-- This prevents breaking existing functionality
INSERT INTO partner_hours (partner_id, day_of_week, opens_at, closes_at, is_closed)
SELECT
  p.id,
  dow,
  '09:00'::TIME,
  '21:00'::TIME,
  FALSE
FROM partners p
CROSS JOIN generate_series(0, 6) AS dow -- 0 = Sunday, 6 = Saturday
WHERE p.is_active = TRUE
  AND p.status IN ('active', 'approved')
  AND NOT EXISTS (
    SELECT 1 FROM partner_hours ph
    WHERE ph.partner_id = p.id AND ph.day_of_week = dow
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 7: AUDIT & CLEANUP
-- ============================================

-- Update timestamp function for waitlist
CREATE OR REPLACE FUNCTION update_waitlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_waitlist_timestamp
BEFORE UPDATE ON booking_waitlist
FOR EACH ROW
EXECUTE FUNCTION update_waitlist_timestamp();

-- Auto-expire waitlist entries (can be run via cron job)
-- Function to mark expired waitlist entries
CREATE OR REPLACE FUNCTION expire_waitlist_entries()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE booking_waitlist
  SET status = 'expired',
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'notified'
    AND expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify partner_hours has data
DO $$
DECLARE
  hours_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO hours_count FROM partner_hours;
  RAISE NOTICE 'partner_hours rows: %', hours_count;
END $$;

-- Verify tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'partner_special_closures') THEN
    RAISE NOTICE '✅ partner_special_closures table created';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_waitlist') THEN
    RAISE NOTICE '✅ booking_waitlist table created';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'is_priority_override') THEN
    RAISE NOTICE '✅ bookings.is_priority_override column added';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'accepting_bookings') THEN
    RAISE NOTICE '✅ partners.accepting_bookings column added';
  END IF;
END $$;
