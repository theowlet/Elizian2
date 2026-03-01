-- Slot granularity: Dining (configurable duration) + Events (partner-defined fixed slots)
-- Dining: 30-min default slots; Events: laughter club 2h, musical 3h, theatre shows, etc.

-- 1. Dining: slot_duration_minutes on partners (15, 30, 45, 60)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER DEFAULT 30
  CHECK (slot_duration_minutes IS NULL OR slot_duration_minutes IN (15, 30, 45, 60));
COMMENT ON COLUMN partners.slot_duration_minutes IS 'Dining: slot granularity in minutes. 30 = 7:00, 7:30, 8:00. Null = use 30.';

-- 2. Events: partner-defined fixed slots per deal (show time, duration, capacity)
CREATE TABLE IF NOT EXISTS event_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  slot_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
  label VARCHAR(100),
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_slots_offer ON event_slots(offer_id);
COMMENT ON TABLE event_slots IS 'Events: fixed slots per deal. E.g. Laughter club 7PM 2h, Musical 8PM 3h, Theatre shows 7PM/8:30PM.';
