-- ============================================
-- FIX: Make loyalty_points.booking_id FK DEFERRABLE
-- ============================================
-- This allows the foreign key constraint to be checked at COMMIT time
-- instead of immediately, preventing errors when inserting loyalty_points
-- within the same transaction as booking creation.

BEGIN;

-- Drop the existing constraint
ALTER TABLE loyalty_points 
  DROP CONSTRAINT IF EXISTS loyalty_points_booking_id_fkey;

-- Recreate it as DEFERRABLE INITIALLY DEFERRED
-- This means the constraint check is deferred until COMMIT
ALTER TABLE loyalty_points 
  ADD CONSTRAINT loyalty_points_booking_id_fkey 
  FOREIGN KEY (booking_id) 
  REFERENCES bookings(id) 
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- Verify the constraint is now deferrable
SELECT 
  conname,
  CASE WHEN condeferrable THEN 'DEFERRABLE' ELSE 'NOT DEFERRABLE' END as deferrable_status,
  CASE WHEN condeferred THEN 'INITIALLY DEFERRED' ELSE 'INITIALLY IMMEDIATE' END as deferred_status
FROM pg_constraint 
WHERE conname = 'loyalty_points_booking_id_fkey';

COMMIT;

