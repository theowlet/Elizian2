-- Store client-provided "booked at" timestamp for accurate "Booked on" display
-- Fixes timezone mismatch when DB/server use different timezone than user
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_at_client TIMESTAMPTZ;

COMMENT ON COLUMN bookings.booked_at_client IS 'Client-provided ISO timestamp when user confirmed booking; used for "Booked on" display in IST';
