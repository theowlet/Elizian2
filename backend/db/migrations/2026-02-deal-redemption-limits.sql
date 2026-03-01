-- Deal redemption limits: total and per-slot for Dining/Events
-- Enables "Join waitlist" when a slot reaches its limit

-- 1. max_redemptions already exists on partner_offers (total limit for deal)
-- 2. Add max_redemptions_per_slot: max per (date, time) for dining, per date for events
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS max_redemptions_per_slot INTEGER;
COMMENT ON COLUMN partner_offers.max_redemptions_per_slot IS 'Max redemptions per time slot (dining) or per date (events). Null = unlimited. Drives waitlist when slot is full.';
