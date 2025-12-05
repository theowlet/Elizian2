-- ============================================
-- CREATE restaurant_availability TABLE
-- Fixes: "relation restaurant_availability does not exist"
-- ============================================

-- Create restaurant_availability table if it doesn't exist
CREATE TABLE IF NOT EXISTS restaurant_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 20, -- Total tables/seats available
  booked_capacity INTEGER DEFAULT 0, -- Currently booked
  is_available BOOLEAN DEFAULT true,
  is_blocked BOOLEAN DEFAULT false, -- Manually blocked by restaurant
  block_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, date, time_slot)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_availability_partner_date ON restaurant_availability(partner_id, date, is_available);
CREATE INDEX IF NOT EXISTS idx_availability_date ON restaurant_availability(date);
CREATE INDEX IF NOT EXISTS idx_availability_time_slot ON restaurant_availability(time_slot);

-- Add comment for documentation
COMMENT ON TABLE restaurant_availability IS 'Real-time availability slots for restaurants - tracks capacity and bookings per time slot';

-- Verify table was created
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'restaurant_availability'
ORDER BY ordinal_position;

