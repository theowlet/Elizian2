-- Bank Offers (BanQ) Schema
-- This enables credit card and bank-specific offers

-- Bank Information Table
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(255) NOT NULL,
  bank_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'HDFC', 'ICICI', 'SBI'
  logo_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0, -- Higher priority shows first
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank Offer Rules Table
CREATE TABLE IF NOT EXISTS bank_offer_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  rule_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Discount Configuration
  discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'flat', 'cashback')),
  discount_value DECIMAL(10, 2) NOT NULL,
  max_discount DECIMAL(10, 2), -- Maximum discount cap
  min_transaction_amount DECIMAL(10, 2) DEFAULT 0, -- Minimum spend requirement
  
  -- Card Type Restrictions
  card_types JSONB, -- ["credit", "debit"] or specific cards
  card_network VARCHAR(50), -- "VISA", "Mastercard", "RuPay", etc.
  
  -- Applicability
  applicable_categories JSONB, -- ["dining", "events", "spa", etc.]
  applicable_partners JSONB, -- Array of partner IDs, NULL = all partners
  applicable_days JSONB, -- ["monday", "friday", etc.], NULL = all days
  
  -- Validity
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  -- Usage Limits
  max_uses_per_user INT, -- NULL = unlimited
  max_total_uses INT, -- NULL = unlimited
  current_uses INT DEFAULT 0,
  
  -- Display
  display_text VARCHAR(500), -- "Get 20% OFF up to ₹500"
  terms_conditions TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Bank Offer Usage Tracking
CREATE TABLE IF NOT EXISTS user_bank_offer_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_offer_rule_id UUID NOT NULL REFERENCES bank_offer_rules(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  discount_applied DECIMAL(10, 2) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, bank_offer_rule_id, booking_id)
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_banks_active ON banks(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_bank_offer_rules_active ON bank_offer_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_bank_offer_rules_validity ON bank_offer_rules(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_bank_offer_rules_bank ON bank_offer_rules(bank_id);
CREATE INDEX IF NOT EXISTS idx_user_bank_offer_usage_user ON user_bank_offer_usage(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_bank_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_banks_updated_at
BEFORE UPDATE ON banks
FOR EACH ROW
EXECUTE FUNCTION update_bank_offers_updated_at();

CREATE TRIGGER update_bank_offer_rules_updated_at
BEFORE UPDATE ON bank_offer_rules
FOR EACH ROW
EXECUTE FUNCTION update_bank_offers_updated_at();

-- Sample Data: Popular Indian Banks
INSERT INTO banks (bank_name, bank_code, logo_url, priority, is_active) VALUES
  ('HDFC Bank', 'HDFC', 'https://logo.clearbit.com/hdfcbank.com', 10, true),
  ('ICICI Bank', 'ICICI', 'https://logo.clearbit.com/icicibank.com', 9, true),
  ('State Bank of India', 'SBI', 'https://logo.clearbit.com/sbi.co.in', 8, true),
  ('Axis Bank', 'AXIS', 'https://logo.clearbit.com/axisbank.com', 7, true),
  ('Kotak Mahindra Bank', 'KOTAK', 'https://logo.clearbit.com/kotak.com', 6, true),
  ('IDFC FIRST Bank', 'IDFC', 'https://logo.clearbit.com/idfcfirstbank.com', 5, true),
  ('American Express', 'AMEX', 'https://logo.clearbit.com/americanexpress.com', 4, true),
  ('IndusInd Bank', 'INDUSIND', 'https://logo.clearbit.com/indusind.com', 3, true)
ON CONFLICT (bank_code) DO NOTHING;

-- Sample Offer Rules (Active offers for next 6 months)
INSERT INTO bank_offer_rules (
  bank_id,
  rule_name,
  description,
  discount_type,
  discount_value,
  max_discount,
  min_transaction_amount,
  card_types,
  applicable_categories,
  valid_from,
  valid_until,
  display_text,
  terms_conditions,
  is_active
)
SELECT 
  b.id,
  b.bank_name || ' Dining Offer',
  '20% OFF on dining and restaurants',
  'percentage',
  20.00,
  500.00,
  1000.00,
  '["credit", "debit"]'::jsonb,
  '["dining", "restaurant"]'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '6 months',
  'Get 20% OFF up to ₹500 on dining',
  'Valid on credit & debit cards. Minimum transaction ₹1000. Valid till ' || TO_CHAR(CURRENT_TIMESTAMP + INTERVAL '6 months', 'DD Mon YYYY'),
  true
FROM banks b
WHERE b.bank_code IN ('HDFC', 'ICICI', 'AXIS')
ON CONFLICT DO NOTHING;

-- Add Events Offers
INSERT INTO bank_offer_rules (
  bank_id,
  rule_name,
  description,
  discount_type,
  discount_value,
  max_discount,
  min_transaction_amount,
  card_types,
  applicable_categories,
  valid_from,
  valid_until,
  display_text,
  terms_conditions,
  is_active
)
SELECT 
  b.id,
  b.bank_name || ' Events Offer',
  '15% OFF on event bookings',
  'percentage',
  15.00,
  1000.00,
  2000.00,
  '["credit"]'::jsonb,
  '["events", "entertainment"]'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '6 months',
  'Get 15% OFF up to ₹1000 on events',
  'Valid on credit cards only. Minimum transaction ₹2000. Valid till ' || TO_CHAR(CURRENT_TIMESTAMP + INTERVAL '6 months', 'DD Mon YYYY'),
  true
FROM banks b
WHERE b.bank_code IN ('SBI', 'KOTAK', 'AMEX')
ON CONFLICT DO NOTHING;

-- Weekend Special Offers
INSERT INTO bank_offer_rules (
  bank_id,
  rule_name,
  description,
  discount_type,
  discount_value,
  max_discount,
  min_transaction_amount,
  card_types,
  applicable_days,
  valid_from,
  valid_until,
  display_text,
  terms_conditions,
  is_active
)
SELECT 
  b.id,
  b.bank_name || ' Weekend Special',
  'Flat ₹300 OFF on weekends',
  'flat',
  300.00,
  300.00,
  1500.00,
  '["credit", "debit"]'::jsonb,
  '["friday", "saturday", "sunday"]'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '3 months',
  'Flat ₹300 OFF on weekends',
  'Valid on Fridays, Saturdays & Sundays. Minimum transaction ₹1500. Valid till ' || TO_CHAR(CURRENT_TIMESTAMP + INTERVAL '3 months', 'DD Mon YYYY'),
  true
FROM banks b
WHERE b.bank_code IN ('IDFC', 'INDUSIND')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE banks IS 'Stores bank/credit card information for BanQ feature';
COMMENT ON TABLE bank_offer_rules IS 'Defines discount rules for bank/card offers';
COMMENT ON TABLE user_bank_offer_usage IS 'Tracks user usage of bank offers to enforce limits';

