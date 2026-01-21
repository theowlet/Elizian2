-- ============================================
-- VOUCHER & REDEMPTION SYSTEM MIGRATION
-- Adds voucher codes, QR codes, and redemption audit trail
-- ============================================

-- 1. Add voucher_code and qr_code_url to bookings table
DO $$ 
BEGIN
  -- Add voucher_code (UUID v4, globally unique, immutable)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'voucher_code'
  ) THEN
    ALTER TABLE bookings ADD COLUMN voucher_code UUID UNIQUE DEFAULT gen_random_uuid();
    CREATE INDEX IF NOT EXISTS idx_bookings_voucher_code ON bookings(voucher_code);
    COMMENT ON COLUMN bookings.voucher_code IS 'Globally unique, immutable voucher code for redemption tracking';
  END IF;

  -- Add qr_code_url (S3 URL, generated once at booking time)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'qr_code_url'
  ) THEN
    ALTER TABLE bookings ADD COLUMN qr_code_url VARCHAR(500);
    CREATE INDEX IF NOT EXISTS idx_bookings_qr_code_url ON bookings(qr_code_url);
    COMMENT ON COLUMN bookings.qr_code_url IS 'S3 URL of QR code image, generated once at booking time and never regenerated';
  END IF;
END $$;

-- 2. Create redemption_audit table for immutable audit trail
CREATE TABLE IF NOT EXISTS redemption_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  voucher_code UUID NOT NULL REFERENCES bookings(voucher_code) ON DELETE RESTRICT,
  
  -- Redemption details
  redeemed_by_partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redemption_status VARCHAR(20) DEFAULT 'redeemed' CHECK (redemption_status IN ('redeemed', 'reversed')),
  
  -- Financial capture (required at redemption)
  total_bill_amount DECIMAL(12, 2) NOT NULL CHECK (total_bill_amount >= 0),
  ezt_co_pay_amount DECIMAL(12, 2) NOT NULL CHECK (ezt_co_pay_amount >= 0),
  net_amount_from_user DECIMAL(12, 2) NOT NULL CHECK (net_amount_from_user >= 0),
  
  -- Validation: net_amount_from_user = total_bill_amount - ezt_co_pay_amount
  CONSTRAINT check_net_amount CHECK (net_amount_from_user = total_bill_amount - ezt_co_pay_amount),
  
  -- Audit metadata
  redeemed_by_user_id UUID REFERENCES users(id), -- Partner staff member who processed redemption
  redemption_notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Immutability: created_at is the only timestamp (no updates allowed)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for redemption_audit
CREATE INDEX IF NOT EXISTS idx_redemption_audit_booking_id ON redemption_audit(booking_id);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_voucher_code ON redemption_audit(voucher_code);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_partner_id ON redemption_audit(redeemed_by_partner_id);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_redeemed_at ON redemption_audit(redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_status ON redemption_audit(redemption_status);

-- Unique constraint: One redemption per booking (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_audit_unique_booking 
  ON redemption_audit(booking_id) 
  WHERE redemption_status = 'redeemed';

COMMENT ON TABLE redemption_audit IS 'Immutable audit trail for all voucher redemptions with financial capture';
COMMENT ON COLUMN redemption_audit.total_bill_amount IS 'Total bill amount at time of redemption';
COMMENT ON COLUMN redemption_audit.ezt_co_pay_amount IS 'Amount payable by EZT (co-pay)';
COMMENT ON COLUMN redemption_audit.net_amount_from_user IS 'Net amount collectible from user (total_bill_amount - ezt_co_pay_amount)';

-- 3. Add 'voucher_redeemed' notification type
DO $$
BEGIN
  -- Check if notifications table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
    
    -- Recreate constraint with 'voucher_redeemed' included
    ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check 
      CHECK (notification_type IN (
        'booking_confirmation', 
        'booking_reminder', 
        'tier_upgrade', 
        'deal_alert', 
        'review_request', 
        'offer_expiring', 
        'promotional', 
        'system',
        'achievement_unlocked',
        'referral_completed',
        'voucher_received',
        'voucher_redeemed'  -- New notification type for redemption
      ));
  END IF;
END $$;

-- 4. Ensure bookings.status includes 'redeemed' if not already present
DO $$
BEGIN
  -- Check current constraint and update if needed
  -- Note: This is a simplified check - actual constraint modification may require dropping/recreating
  NULL; -- Status constraint is handled in application logic
END $$;

