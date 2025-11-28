-- Migration: Loyalty + Theatre Module Foundations
-- Generated: 2025-11-17

BEGIN;

-- Loyalty activity ledger
CREATE TABLE IF NOT EXISTS loyalty_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  description TEXT,
  points_earned NUMERIC(12,2) DEFAULT 0,
  points_spent NUMERIC(12,2) DEFAULT 0,
  balance_after NUMERIC(12,2) DEFAULT 0,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_loyalty_activity_user ON loyalty_activity(user_id);

-- Loyalty tier thresholds
CREATE TABLE IF NOT EXISTS loyalty_tier_thresholds (
  tier_id UUID PRIMARY KEY REFERENCES tiers(id) ON DELETE CASCADE,
  min_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  earning_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  perks JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Theatre / movie module tables
CREATE TABLE IF NOT EXISTS theatres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  location TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_id UUID NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  seating_capacity INTEGER NOT NULL DEFAULT 0,
  layout JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_screens_theatre ON screens(theatre_id);

CREATE TABLE IF NOT EXISTS seat_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  row_label VARCHAR(10) NOT NULL,
  seat_number INTEGER NOT NULL,
  seat_type VARCHAR(50) DEFAULT 'standard',
  price_zone VARCHAR(50),
  base_price NUMERIC(10,2),
  metadata JSONB,
  UNIQUE(screen_id, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  language VARCHAR(50),
  format VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shows_screen_start ON shows(screen_id, start_time);

CREATE TABLE IF NOT EXISTS show_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_template_id UUID NOT NULL REFERENCES seat_templates(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  price NUMERIC(10,2),
  reservation_expires_at TIMESTAMP WITH TIME ZONE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  UNIQUE(show_id, seat_template_id)
);
CREATE INDEX IF NOT EXISTS idx_show_seats_status ON show_seats(show_id, status);

COMMIT;

