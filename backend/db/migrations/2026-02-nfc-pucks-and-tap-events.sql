-- NFC Pucks and Tap Events
-- Used by: nfcController, partnerController.getCheckInsToday
-- Run: node scripts/run-migrations.js (or include in run-bookings-migrations if desired)

CREATE TABLE IF NOT EXISTS nfc_pucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puck_code VARCHAR(20) NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  label VARCHAR(255),
  location_hint TEXT,
  is_active BOOLEAN DEFAULT true,
  tap_count INT DEFAULT 0,
  last_tapped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nfc_pucks_partner ON nfc_pucks(partner_id);
CREATE INDEX IF NOT EXISTS idx_nfc_pucks_code ON nfc_pucks(puck_code);

CREATE TABLE IF NOT EXISTS nfc_tap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puck_id UUID NOT NULL REFERENCES nfc_pucks(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tap_type VARCHAR(20) DEFAULT 'checkin',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_puck ON nfc_tap_events(puck_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_partner ON nfc_tap_events(partner_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_user ON nfc_tap_events(user_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tap_events_created ON nfc_tap_events(created_at DESC);

COMMENT ON TABLE nfc_pucks IS 'Partner-registered NFC pucks for venue check-in';
COMMENT ON TABLE nfc_tap_events IS 'Consumer tap events (check-in) at NFC pucks';
