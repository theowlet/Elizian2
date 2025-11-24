-- ============================================
-- VOUCHER SYSTEM FIXES
-- Fixes race conditions and adds proper constraints
-- ============================================

-- Add unique constraint on booking_id (one voucher per booking)
-- This prevents race conditions where multiple requests try to create vouchers for the same booking
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_booking_voucher'
  ) THEN
    ALTER TABLE vouchers 
      ADD CONSTRAINT unique_booking_voucher UNIQUE (booking_id);
    
    RAISE NOTICE 'Added unique constraint on booking_id';
  ELSE
    RAISE NOTICE 'Constraint unique_booking_voucher already exists';
  END IF;
END $$;

-- Add index on expires_at for efficient expiry checks
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at ON vouchers(expires_at) 
  WHERE status = 'active';

-- Mark existing expired vouchers
UPDATE vouchers 
SET status = 'expired', updated_at = CURRENT_TIMESTAMP
WHERE status = 'active' 
  AND expires_at < CURRENT_TIMESTAMP;

-- Add comment for documentation
COMMENT ON CONSTRAINT unique_booking_voucher ON vouchers IS 
  'Ensures one voucher per booking, preventing race conditions in concurrent voucher creation';

