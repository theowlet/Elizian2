-- Add booking_mode column for structured booking architecture
-- ONLINE_TIME_SLOT: Dining, Events (date+time, slot inventory)
-- PARTNER_CONFIRMATION: Healthcare, Spa, Wellness, Travel, Others (date only, contact partner for time)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(32);

COMMENT ON COLUMN bookings.booking_mode IS 'ONLINE_TIME_SLOT | PARTNER_CONFIRMATION. Inferred from service_type for legacy rows.';
