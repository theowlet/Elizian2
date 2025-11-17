-- ============================================
-- DEAL SLOTS TABLE
-- For managing time slots and availability for deals
-- ============================================

CREATE TABLE IF NOT EXISTS deal_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot VARCHAR(20),
  capacity INT NOT NULL DEFAULT 0,
  booked INT DEFAULT 0,
  price NUMERIC(10,2),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_deal_slot UNIQUE(deal_id, date, time_slot)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deal_slots_deal_id ON deal_slots(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_slots_date ON deal_slots(date);
CREATE INDEX IF NOT EXISTS idx_deal_slots_available ON deal_slots(is_available, date);
CREATE INDEX IF NOT EXISTS idx_deal_slots_capacity ON deal_slots(deal_id, date, time_slot) WHERE capacity > booked;

-- Add deal_id column to bookings if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'deal_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN deal_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bookings_deal_id ON bookings(deal_id);
  END IF;
  
  -- Add slot_id to bookings for tracking which slot was booked
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'slot_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN slot_id UUID REFERENCES deal_slots(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
  END IF;
END $$;

