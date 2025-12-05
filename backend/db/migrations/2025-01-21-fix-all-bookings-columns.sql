-- ============================================
-- FIX ALL MISSING BOOKINGS TABLE COLUMNS
-- Run this script to add all missing columns
-- ============================================

BEGIN;

-- 1. booking_reference (CRITICAL - used everywhere)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_reference'
  ) THEN
    ALTER TABLE bookings ADD COLUMN booking_reference VARCHAR(100);
    UPDATE bookings SET booking_reference = 'BK-' || EXTRACT(EPOCH FROM COALESCE(created_at, CURRENT_TIMESTAMP))::BIGINT || '-' || SUBSTRING(MD5(id::TEXT), 1, 6)
    WHERE booking_reference IS NULL;
    ALTER TABLE bookings ALTER COLUMN booking_reference SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_booking_reference ON bookings(booking_reference);
    RAISE NOTICE '✅ Added booking_reference column';
  END IF;
END $$;

-- 2. partner_id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'partner_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN partner_id UUID REFERENCES partners(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bookings_partner_id ON bookings(partner_id);
    RAISE NOTICE '✅ Added partner_id column';
  END IF;
END $$;

-- 3. deal_id (separate from offer_id)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'deal_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN deal_id UUID REFERENCES partner_offers(id) ON DELETE SET NULL;
    UPDATE bookings SET deal_id = offer_id WHERE offer_id IS NOT NULL AND deal_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_bookings_deal_id ON bookings(deal_id);
    RAISE NOTICE '✅ Added deal_id column';
  END IF;
END $$;

-- 4. show_id (for theatre bookings)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'show_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN show_id UUID;
    -- Note: FK constraint omitted if shows table doesn't exist yet
    CREATE INDEX IF NOT EXISTS idx_bookings_show_id ON bookings(show_id);
    RAISE NOTICE '✅ Added show_id column';
  END IF;
END $$;

-- 5. booking_date (DATE type, not TIMESTAMP)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_date' AND data_type = 'date'
  ) THEN
    -- Check if it exists as TIMESTAMP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'booking_date' AND data_type LIKE 'timestamp%'
    ) THEN
      -- Convert TIMESTAMP to DATE
      ALTER TABLE bookings RENAME COLUMN booking_date TO booking_datetime_old;
      ALTER TABLE bookings ADD COLUMN booking_date DATE DEFAULT CURRENT_DATE;
      UPDATE bookings SET booking_date = booking_datetime_old::DATE WHERE booking_date IS NULL;
      ALTER TABLE bookings DROP COLUMN booking_datetime_old;
    ELSE
      ALTER TABLE bookings ADD COLUMN booking_date DATE DEFAULT CURRENT_DATE;
    END IF;
    ALTER TABLE bookings ALTER COLUMN booking_date SET NOT NULL;
    RAISE NOTICE '✅ Added booking_date column (DATE type)';
  END IF;
END $$;

-- 6. booking_time (TIME type)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_time'
  ) THEN
    ALTER TABLE bookings ADD COLUMN booking_time TIME DEFAULT CURRENT_TIME;
    ALTER TABLE bookings ALTER COLUMN booking_time SET NOT NULL;
    RAISE NOTICE '✅ Added booking_time column';
  END IF;
END $$;

-- 7. booking_type (with CHECK constraint)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_type'
  ) THEN
    ALTER TABLE bookings ADD COLUMN booking_type VARCHAR(50) DEFAULT 'offer';
    UPDATE bookings SET booking_type = CASE
      WHEN event_id IS NOT NULL THEN 'event'
      WHEN show_id IS NOT NULL THEN 'theatre'
      ELSE 'offer'
    END WHERE booking_type = 'offer';
    ALTER TABLE bookings ALTER COLUMN booking_type SET NOT NULL;
    RAISE NOTICE '✅ Added booking_type column';
  END IF;
  
  -- Ensure CHECK constraint exists with correct values
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_booking_type_check 
    CHECK (booking_type IN ('offer', 'event', 'restaurant', 'theatre', 'spa', 'wellness', 'healthcare', 'travel'));
  RAISE NOTICE '✅ Ensured booking_type CHECK constraint is correct';
END $$;

-- 8. Rename amount to total_price if needed
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'total_price'
  ) THEN
    ALTER TABLE bookings RENAME COLUMN amount TO total_price;
    RAISE NOTICE '✅ Renamed amount to total_price';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'total_price'
  ) THEN
    ALTER TABLE bookings ADD COLUMN total_price DECIMAL(12, 2) NOT NULL DEFAULT 0;
    RAISE NOTICE '✅ Added total_price column';
  END IF;
END $$;

-- 9. fiat_amount (CRITICAL - original amount before EZT discount)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'fiat_amount'
  ) THEN
    ALTER TABLE bookings ADD COLUMN fiat_amount DECIMAL(12, 2) DEFAULT 0;
    UPDATE bookings SET fiat_amount = total_price WHERE fiat_amount = 0;
    ALTER TABLE bookings ALTER COLUMN fiat_amount SET NOT NULL;
    RAISE NOTICE '✅ Added fiat_amount column';
  END IF;
END $$;

-- 10. ezt_redeemed
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'ezt_redeemed'
  ) THEN
    ALTER TABLE bookings ADD COLUMN ezt_redeemed DECIMAL(15, 5) DEFAULT 0;
    RAISE NOTICE '✅ Added ezt_redeemed column';
  END IF;
END $$;

-- 11. ezt_earned
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'ezt_earned'
  ) THEN
    ALTER TABLE bookings ADD COLUMN ezt_earned DECIMAL(15, 5) DEFAULT 0;
    RAISE NOTICE '✅ Added ezt_earned column';
  END IF;
END $$;

-- 12. ezt_reward_percentage
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'ezt_reward_percentage'
  ) THEN
    ALTER TABLE bookings ADD COLUMN ezt_reward_percentage DECIMAL(5, 2) DEFAULT 1.0;
    RAISE NOTICE '✅ Added ezt_reward_percentage column';
  END IF;
END $$;

-- 13. user_tier_at_booking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'user_tier_at_booking'
  ) THEN
    ALTER TABLE bookings ADD COLUMN user_tier_at_booking VARCHAR(50);
    RAISE NOTICE '✅ Added user_tier_at_booking column';
  END IF;
END $$;

-- 14. reward_eligible
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'reward_eligible'
  ) THEN
    ALTER TABLE bookings ADD COLUMN reward_eligible BOOLEAN DEFAULT true;
    RAISE NOTICE '✅ Added reward_eligible column';
  END IF;
END $$;

-- 15. reward_credited
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'reward_credited'
  ) THEN
    ALTER TABLE bookings ADD COLUMN reward_credited BOOLEAN DEFAULT false;
    RAISE NOTICE '✅ Added reward_credited column';
  END IF;
END $$;

-- 16. num_guests
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'num_guests'
  ) THEN
    ALTER TABLE bookings ADD COLUMN num_guests INTEGER DEFAULT 1;
    UPDATE bookings SET num_guests = num_tickets WHERE num_guests = 1 AND num_tickets IS NOT NULL;
    RAISE NOTICE '✅ Added num_guests column';
  END IF;
END $$;

-- 17. seat_template_ids (for theatre bookings)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'seat_template_ids'
  ) THEN
    ALTER TABLE bookings ADD COLUMN seat_template_ids JSONB;
    RAISE NOTICE '✅ Added seat_template_ids column';
  END IF;
END $$;

-- 18. cancelled_at
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN cancelled_at TIMESTAMP;
    RAISE NOTICE '✅ Added cancelled_at column';
  END IF;
END $$;

-- 19. cancellation_reason
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT;
    RAISE NOTICE '✅ Added cancellation_reason column';
  END IF;
END $$;

-- 20. commission_percentage
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'commission_percentage'
  ) THEN
    ALTER TABLE bookings ADD COLUMN commission_percentage DECIMAL(5, 2) DEFAULT 10.0;
    RAISE NOTICE '✅ Added commission_percentage column';
  END IF;
END $$;

-- 21. partner_earning
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'partner_earning'
  ) THEN
    ALTER TABLE bookings ADD COLUMN partner_earning DECIMAL(12, 2);
    RAISE NOTICE '✅ Added partner_earning column';
  END IF;
END $$;

-- Update status constraint to include all statuses
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'bookings' AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check 
      CHECK (status IN ('pending', 'confirmed', 'cancelled', 'redeemed', 'expired', 'refunded'));
    RAISE NOTICE '✅ Updated status constraint to include all statuses';
  END IF;
END $$;

-- Create updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON bookings;
CREATE TRIGGER trigger_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();

COMMIT;

-- Verify all columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
ORDER BY ordinal_position;

