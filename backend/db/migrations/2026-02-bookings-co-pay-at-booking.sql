-- Store deal co-pay at booking time so redemption uses the terms that applied when the user booked,
-- not the current deal terms (which may have been changed after booking).
-- Redemption logic: use co_pay_percentage_at_booking when present; else fall back to current offer.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS co_pay_percentage_at_booking NUMERIC(5,2) NULL;
COMMENT ON COLUMN bookings.co_pay_percentage_at_booking IS 'Deal co-pay % at time of booking. Used for redemption; overrides current offer co_pay_percentage when set.';
