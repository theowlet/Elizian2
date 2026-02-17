-- Enterprise Booking Engine: Concurrency-Safe Slots + Echelon + Waitlist
-- Date: 2026-02
-- Purpose: Additive only. No renames, no drops. Legacy behavior preserved when tables empty/missing.

-- ============================================
-- 1. VENUE TIME SLOTS (capacity + Echelon buffer)
-- ============================================

CREATE TABLE IF NOT EXISTS venue_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  slot_datetime TIMESTAMP NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  booked_count INTEGER DEFAULT 0,
  echelon_buffer INTEGER DEFAULT 2,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, slot_datetime)
);

CREATE INDEX IF NOT EXISTS idx_slot_lookup
ON venue_time_slots(partner_id, slot_datetime);

CREATE INDEX IF NOT EXISTS idx_slot_datetime
ON venue_time_slots(slot_datetime);

COMMENT ON TABLE venue_time_slots IS 'Optional slot-based capacity. When present, used for concurrency-safe booking; when absent, legacy restaurant_availability is used.';

-- ============================================
-- 2. BOOKINGS: is_priority_override (if not already added)
-- ============================================

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS is_priority_override BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN bookings.is_priority_override IS 'True when Echelon tier was used to book within echelon_buffer capacity';

-- ============================================
-- 3. WAITLIST: use existing booking_waitlist (no schema change)
-- Index already exists: idx_waitlist_partner_datetime on (partner_id, booking_date, booking_time)
-- ============================================

-- ============================================
-- 4. VERIFICATION
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venue_time_slots') THEN
    RAISE NOTICE '✅ venue_time_slots table ready';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'is_priority_override') THEN
    RAISE NOTICE '✅ bookings.is_priority_override column ready';
  END IF;
END $$;
