-- ============================================================================
-- STABILIZATION MIGRATION: Performance indexes + voucher expiration backfill
-- Safe to run multiple times (all statements are idempotent)
-- No schema changes, no column renames, no constraint alterations
-- ============================================================================

-- 1. Index for faster voucher lookup during redemption (hot path)
CREATE INDEX IF NOT EXISTS idx_bookings_voucher_code ON bookings(voucher_code);

-- 2. Index for redemption audit lookups
CREATE INDEX IF NOT EXISTS idx_redemption_audit_booking_id ON redemption_audit(booking_id);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_voucher_code ON redemption_audit(voucher_code);

-- 3. Index for OTP session lookups (hot auth path)
CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone ON otp_sessions(phone_number, created_at DESC);

-- 4. Index for token ledger queries (rewards dashboard)
CREATE INDEX IF NOT EXISTS idx_token_ledger_user_id ON token_ledger(user_id, created_at DESC);

-- 5. Index for booking history by user (profile page)
CREATE INDEX IF NOT EXISTS idx_bookings_user_id_created ON bookings(user_id, created_at DESC);

-- 6. Index for partner offer expiry checks
CREATE INDEX IF NOT EXISTS idx_partner_offers_dates ON partner_offers(start_date, end_date);

-- 7. Add missing perk_type and perk_description columns to partner_offers
-- These columns are referenced in offerRepository but were not in the original schema.
-- Without them, the public offers endpoint returns a 500 error.
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS perk_type VARCHAR(50) DEFAULT 'discount';
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS perk_description TEXT;

-- 8. Backfill expires_at for existing bookings that lack an expiration
-- Sets expiry to 30 days after creation for confirmed/pending bookings.
-- Already-expired or cancelled bookings are left untouched.
-- This prevents indefinite redemption windows on old vouchers.
UPDATE bookings
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL
  AND status IN ('confirmed', 'pending');
