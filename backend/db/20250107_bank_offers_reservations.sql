-- ============================================
-- BANK OFFERS & TABLE RESERVATIONS SYSTEM
-- ============================================
-- Dynamic bank offers management (not hardcoded)
-- Advanced table reservation system
-- Pre-ordering for Echelon tier

-- 1. Bank Offers Table
CREATE TABLE IF NOT EXISTS bank_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(100) NOT NULL,
  bank_code VARCHAR(50) NOT NULL UNIQUE,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority shows first
  description TEXT,
  terms_and_conditions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bank Offer Rules Table (supports multiple offers per bank)
CREATE TABLE IF NOT EXISTS bank_offer_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_offer_id UUID NOT NULL REFERENCES bank_offers(id) ON DELETE CASCADE,
  offer_type VARCHAR(50) NOT NULL, -- 'discount', 'cashback', 'bogo', 'flat_off'
  offer_value DECIMAL(10, 2) NOT NULL, -- Percentage or flat amount
  max_discount DECIMAL(10, 2), -- Maximum discount cap
  min_order_amount DECIMAL(10, 2) DEFAULT 0, -- Minimum order to avail
  applicable_categories JSONB, -- Which categories this applies to (null = all)
  applicable_partners JSONB, -- Which partners this applies to (null = all)
  applicable_tiers JSONB, -- Which tiers can use this (null = all)
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table Reservations Table
CREATE TABLE IF NOT EXISTS table_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id),
  user_id UUID NOT NULL REFERENCES users(id),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  occasion VARCHAR(50), -- 'birthday', 'anniversary', 'date_night', 'business', 'family', etc.
  special_requests TEXT,
  seating_preference VARCHAR(50), -- 'window', 'outdoor', 'private', 'bar', 'none'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  table_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Restaurant Availability Slots Table
CREATE TABLE IF NOT EXISTS restaurant_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  max_capacity INTEGER NOT NULL, -- Total tables/seats available
  booked_capacity INTEGER DEFAULT 0, -- Currently booked
  is_available BOOLEAN DEFAULT true,
  is_blocked BOOLEAN DEFAULT false, -- Manually blocked by restaurant
  block_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, date, time_slot)
);

-- 5. Pre-Orders Table (for Echelon tier)
CREATE TABLE IF NOT EXISTS pre_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES table_reservations(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id),
  user_id UUID NOT NULL REFERENCES users(id),
  items JSONB NOT NULL, -- Array of {item_name, quantity, price, special_instructions}
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'
  special_instructions TEXT,
  dietary_requirements TEXT,
  estimated_ready_time TIMESTAMP,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Bank Offer Usage Tracking
CREATE TABLE IF NOT EXISTS bank_offer_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  bank_offer_id UUID NOT NULL REFERENCES bank_offers(id),
  bank_offer_rule_id UUID NOT NULL REFERENCES bank_offer_rules(id),
  user_id UUID NOT NULL REFERENCES users(id),
  order_amount DECIMAL(10, 2) NOT NULL,
  discount_applied DECIMAL(10, 2) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bank_offers_active ON bank_offers(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_bank_offer_rules_active ON bank_offer_rules(bank_offer_id, is_active, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_reservations_partner_date ON table_reservations(partner_id, reservation_date, reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON table_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON table_reservations(status);
CREATE INDEX IF NOT EXISTS idx_availability_partner_date ON restaurant_availability(partner_id, date, is_available);
CREATE INDEX IF NOT EXISTS idx_pre_orders_booking ON pre_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_reservation ON pre_orders(reservation_id);
CREATE INDEX IF NOT EXISTS idx_bank_offer_usage_booking ON bank_offer_usage(booking_id);

-- Insert default bank offers (can be managed via admin later)
INSERT INTO bank_offers (bank_name, bank_code, logo_url, is_active, priority, description) VALUES
('HDFC Bank', 'HDFC', NULL, true, 4, 'HDFC Bank Credit/Debit Cards'),
('ICICI Bank', 'ICICI', NULL, true, 3, 'ICICI Bank Credit/Debit Cards'),
('Axis Bank', 'AXIS', NULL, true, 2, 'Axis Bank Credit/Debit Cards'),
('State Bank of India', 'SBI', NULL, true, 1, 'SBI Credit/Debit Cards')
ON CONFLICT (bank_code) DO NOTHING;

-- Insert default bank offer rules
INSERT INTO bank_offer_rules (bank_offer_id, offer_type, offer_value, max_discount, min_order_amount, description, is_active, valid_from, valid_until)
SELECT 
  bo.id,
  'discount',
  20.00,
  500.00,
  2000.00,
  'Get 20% OFF (up to ₹500)',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 year'
FROM bank_offers bo WHERE bo.bank_code = 'HDFC'
ON CONFLICT DO NOTHING;

INSERT INTO bank_offer_rules (bank_offer_id, offer_type, offer_value, max_discount, min_order_amount, description, is_active, valid_from, valid_until)
SELECT 
  bo.id,
  'cashback',
  15.00,
  300.00,
  1500.00,
  'Get 15% Cashback (up to ₹300)',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 year'
FROM bank_offers bo WHERE bo.bank_code = 'ICICI'
ON CONFLICT DO NOTHING;

INSERT INTO bank_offer_rules (bank_offer_id, offer_type, offer_value, max_discount, min_order_amount, description, is_active, valid_from, valid_until)
SELECT 
  bo.id,
  'discount',
  10.00,
  250.00,
  1000.00,
  'Get 10% OFF (up to ₹250)',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 year'
FROM bank_offers bo WHERE bo.bank_code = 'AXIS'
ON CONFLICT DO NOTHING;

INSERT INTO bank_offer_rules (bank_offer_id, offer_type, offer_value, max_discount, min_order_amount, description, is_active, valid_from, valid_until)
SELECT 
  bo.id,
  'bogo',
  0.00,
  NULL,
  500.00,
  'Buy 1 Get 1 on select items',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 year'
FROM bank_offers bo WHERE bo.bank_code = 'SBI'
ON CONFLICT DO NOTHING;

-- Add comments
COMMENT ON TABLE bank_offers IS 'Dynamic bank offers management - can be added/updated via admin';
COMMENT ON TABLE bank_offer_rules IS 'Multiple offer rules per bank (discount, cashback, BOGO, etc.)';
COMMENT ON TABLE table_reservations IS 'Advanced table reservation system for restaurants';
COMMENT ON TABLE restaurant_availability IS 'Real-time availability slots for restaurants';
COMMENT ON TABLE pre_orders IS 'Pre-ordering feature for Echelon tier members';
COMMENT ON TABLE bank_offer_usage IS 'Track which bank offers were used in bookings';

