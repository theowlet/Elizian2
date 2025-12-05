-- ============================================
-- FINAL FIX: Booking Type Constraint
-- Run this to fix the constraint once and for all
-- ============================================

BEGIN;

-- Drop any existing booking_type constraints
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_type_check;

-- Add the correct constraint
ALTER TABLE bookings ADD CONSTRAINT bookings_booking_type_check 
  CHECK (booking_type IN ('offer', 'event', 'restaurant', 'theatre', 'spa', 'wellness', 'healthcare', 'travel'));

-- Verify the constraint
SELECT 
  conname as constraint_name, 
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'bookings'::regclass 
  AND conname LIKE '%booking_type%';

COMMIT;

-- ============================================
-- TEST: Manual INSERT to verify constraint works
-- ============================================
-- Uncomment below to test (make sure you have at least one user in the database)

/*
BEGIN;

INSERT INTO bookings (
  booking_reference,
  user_id,
  booking_type,
  status,
  total_price,
  fiat_amount,
  num_tickets
) VALUES (
  'TEST-001',
  (SELECT id FROM users LIMIT 1),
  'restaurant',  -- This should work
  'pending',
  100.00,
  100.00,
  1
) RETURNING id, booking_type;

-- If successful, clean up test
DELETE FROM bookings WHERE booking_reference = 'TEST-001';

COMMIT;
*/

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check constraint definition
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'bookings'::regclass 
  AND conname = 'bookings_booking_type_check';

-- Check for any invalid booking_type values
SELECT 
  id,
  booking_reference,
  booking_type,
  created_at
FROM bookings
WHERE booking_type IS NULL 
   OR booking_type NOT IN ('offer', 'event', 'restaurant', 'theatre', 'spa', 'wellness', 'healthcare', 'travel')
LIMIT 10;

-- If invalid values found, fix them:
/*
UPDATE bookings 
SET booking_type = 'offer'
WHERE booking_type IS NULL 
   OR booking_type NOT IN ('offer', 'event', 'restaurant', 'theatre', 'spa', 'wellness', 'healthcare', 'travel');
*/

