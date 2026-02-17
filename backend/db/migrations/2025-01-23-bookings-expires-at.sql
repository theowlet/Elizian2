-- Add expires_at to bookings (voucher redemption window)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN expires_at TIMESTAMP;
    COMMENT ON COLUMN bookings.expires_at IS 'Voucher expiry; when null, no expiry. Used for redemption window.';
    RAISE NOTICE '✅ Added expires_at column to bookings';
  END IF;
END $$;
