-- Enterprise: store campaign reward_multiplier on booking for use at redemption
-- Backward compatible: default 1.0
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reward_multiplier DECIMAL(5,2) DEFAULT 1.0;
COMMENT ON COLUMN bookings.reward_multiplier IS 'Campaign-derived multiplier applied at redemption when crediting EZT (1.0 = no boost)';
