-- ============================================
-- ENTERPRISE-GRADE VOUCHER SYSTEM ENHANCEMENTS
-- Adds state machine, settlement tracking, audit logs, and admin controls
-- ============================================

-- 1. Add voucher_state to bookings table (state machine)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'voucher_state'
  ) THEN
    ALTER TABLE bookings ADD COLUMN voucher_state VARCHAR(20) DEFAULT 'created';
    COMMENT ON COLUMN bookings.voucher_state IS 'Voucher lifecycle state: created, booked, active, redeemed, settled, closed';
  END IF;
END $$;

-- Add state transition tracking
CREATE TABLE IF NOT EXISTS voucher_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  voucher_code UUID NOT NULL REFERENCES bookings(voucher_code) ON DELETE CASCADE,
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  transitioned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id UUID, -- User/Partner/Admin ID
  actor_role VARCHAR(20) NOT NULL CHECK (actor_role IN ('user', 'partner', 'admin', 'system')),
  reason_code VARCHAR(50), -- Reason for transition
  reason_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voucher_state_transitions_booking_id ON voucher_state_transitions(booking_id);
CREATE INDEX IF NOT EXISTS idx_voucher_state_transitions_voucher_code ON voucher_state_transitions(voucher_code);
CREATE INDEX IF NOT EXISTS idx_voucher_state_transitions_actor ON voucher_state_transitions(actor_id, actor_role);
CREATE INDEX IF NOT EXISTS idx_voucher_state_transitions_date ON voucher_state_transitions(transitioned_at DESC);

COMMENT ON TABLE voucher_state_transitions IS 'Immutable log of all voucher state transitions for audit and compliance';

-- 2. Add settlement tracking to redemption_audit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'settlement_status'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN settlement_status VARCHAR(20) DEFAULT 'pending' 
      CHECK (settlement_status IN ('pending', 'invoiced', 'settled', 'disputed', 'frozen'));
    COMMENT ON COLUMN redemption_audit.settlement_status IS 'Settlement lifecycle: pending, invoiced, settled, disputed, frozen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'settled_at'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN settled_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'settled_by'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN settled_by UUID REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'dispute_reason'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN dispute_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'is_frozen'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN is_frozen BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'frozen_by'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN frozen_by UUID REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'frozen_at'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN frozen_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'redemption_audit' AND column_name = 'frozen_reason'
  ) THEN
    ALTER TABLE redemption_audit ADD COLUMN frozen_reason TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_redemption_audit_settlement_status ON redemption_audit(settlement_status);
CREATE INDEX IF NOT EXISTS idx_redemption_audit_is_frozen ON redemption_audit(is_frozen);

-- 3. Create immutable audit log table
CREATE TABLE IF NOT EXISTS voucher_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  voucher_code UUID REFERENCES bookings(voucher_code) ON DELETE CASCADE,
  redemption_id UUID REFERENCES redemption_audit(id) ON DELETE SET NULL,
  
  -- Audit details
  action VARCHAR(50) NOT NULL, -- 'voucher_created', 'qr_generated', 'redemption_attempt', 'redemption_success', 'redemption_failure', 'financial_capture', 'admin_override', 'settlement_update', 'dispute_raised', 'freeze_applied'
  actor_id UUID,
  actor_role VARCHAR(20) NOT NULL CHECK (actor_role IN ('user', 'partner', 'admin', 'system')),
  
  -- Request/Response data (immutable snapshot)
  request_data JSONB,
  response_data JSONB,
  error_data JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  reason_code VARCHAR(50),
  reason_text TEXT,
  
  -- Timestamp (immutable)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_booking_id ON voucher_audit_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_voucher_code ON voucher_audit_log(voucher_code);
CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_redemption_id ON voucher_audit_log(redemption_id);
CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_action ON voucher_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_actor ON voucher_audit_log(actor_id, actor_role);
CREATE INDEX IF NOT EXISTS idx_voucher_audit_log_created_at ON voucher_audit_log(created_at DESC);

COMMENT ON TABLE voucher_audit_log IS 'Immutable, append-only audit log for all voucher operations. Never updated or deleted.';

-- 4. Add redemption rules table (for time-based controls)
CREATE TABLE IF NOT EXISTS redemption_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES partner_offers(id) ON DELETE CASCADE,
  
  -- Rule type
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('day_of_week', 'time_slot', 'blackout_date', 'validity_window')),
  
  -- Day of week restrictions (0=Sunday, 6=Saturday)
  allowed_days INTEGER[], -- Array of day numbers (0-6)
  
  -- Time slot restrictions
  allowed_time_start TIME,
  allowed_time_end TIME,
  
  -- Blackout dates
  blackout_dates DATE[],
  
  -- Validity window
  validity_start_date DATE,
  validity_end_date DATE,
  
  -- Rule metadata
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority rules override lower ones
  description TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redemption_rules_partner_id ON redemption_rules(partner_id);
CREATE INDEX IF NOT EXISTS idx_redemption_rules_offer_id ON redemption_rules(offer_id);
CREATE INDEX IF NOT EXISTS idx_redemption_rules_type ON redemption_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_redemption_rules_active ON redemption_rules(is_active);

COMMENT ON TABLE redemption_rules IS 'Time and rule-based redemption controls for partners and offers';

-- 5. Add admin override tracking
CREATE TABLE IF NOT EXISTS admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  redemption_id UUID REFERENCES redemption_audit(id) ON DELETE CASCADE,
  
  -- Override details
  override_type VARCHAR(50) NOT NULL CHECK (override_type IN ('status_change', 'financial_adjustment', 'settlement_override', 'freeze_override', 'rule_bypass')),
  admin_id UUID NOT NULL REFERENCES users(id),
  reason_code VARCHAR(50) NOT NULL, -- 'fraud_investigation', 'customer_service', 'technical_issue', 'partner_request', 'other'
  reason_text TEXT NOT NULL,
  
  -- Override data
  previous_value JSONB,
  new_value JSONB,
  
  -- Approval (if required)
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_booking_id ON admin_overrides(booking_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_redemption_id ON admin_overrides(redemption_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_admin_id ON admin_overrides(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_type ON admin_overrides(override_type);

COMMENT ON TABLE admin_overrides IS 'Audit trail of all admin overrides with mandatory reason codes';

-- 6. Update bookings table to track voucher state transitions
-- (State machine will be enforced in application code, but we track it in DB)

-- 7. Create function to log state transitions (called by application)
CREATE OR REPLACE FUNCTION log_voucher_state_transition(
  p_booking_id UUID,
  p_voucher_code UUID,
  p_from_state VARCHAR,
  p_to_state VARCHAR,
  p_actor_id UUID,
  p_actor_role VARCHAR,
  p_reason_code VARCHAR DEFAULT NULL,
  p_reason_text TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  transition_id UUID;
BEGIN
  INSERT INTO voucher_state_transitions (
    booking_id,
    voucher_code,
    from_state,
    to_state,
    actor_id,
    actor_role,
    reason_code,
    reason_text,
    metadata
  ) VALUES (
    p_booking_id,
    p_voucher_code,
    p_from_state,
    p_to_state,
    p_actor_id,
    p_actor_role,
    p_reason_code,
    p_reason_text,
    p_metadata
  ) RETURNING id INTO transition_id;
  
  RETURN transition_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to log audit events (append-only)
CREATE OR REPLACE FUNCTION log_voucher_audit(
  p_booking_id UUID,
  p_voucher_code UUID,
  p_redemption_id UUID,
  p_action VARCHAR,
  p_actor_id UUID,
  p_actor_role VARCHAR,
  p_request_data JSONB DEFAULT NULL,
  p_response_data JSONB DEFAULT NULL,
  p_error_data JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_reason_code VARCHAR DEFAULT NULL,
  p_reason_text TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO voucher_audit_log (
    booking_id,
    voucher_code,
    redemption_id,
    action,
    actor_id,
    actor_role,
    request_data,
    response_data,
    error_data,
    ip_address,
    user_agent,
    reason_code,
    reason_text
  ) VALUES (
    p_booking_id,
    p_voucher_code,
    p_redemption_id,
    p_action,
    p_actor_id,
    p_actor_role,
    p_request_data,
    p_response_data,
    p_error_data,
    p_ip_address,
    p_user_agent,
    p_reason_code,
    p_reason_text
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Add trigger to prevent updates/deletes on audit log (immutability)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit log is immutable. Updates and deletes are not allowed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON voucher_audit_log;
CREATE TRIGGER trg_prevent_audit_log_modification
  BEFORE UPDATE OR DELETE ON voucher_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- 10. Add trigger to prevent updates/deletes on state transitions (immutability)
DROP TRIGGER IF EXISTS trg_prevent_state_transition_modification ON voucher_state_transitions;
CREATE TRIGGER trg_prevent_state_transition_modification
  BEFORE UPDATE OR DELETE ON voucher_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- 11. Initialize existing bookings with voucher_state
UPDATE bookings 
SET voucher_state = CASE 
  WHEN status = 'redeemed' THEN 'redeemed'
  WHEN status = 'confirmed' THEN 'active'
  WHEN status = 'pending' THEN 'booked'
  ELSE 'created'
END
WHERE voucher_state IS NULL OR voucher_state = 'created';

COMMENT ON TABLE voucher_state_transitions IS 'Immutable log of all voucher state transitions';
COMMENT ON TABLE voucher_audit_log IS 'Immutable, append-only audit log for compliance and fraud detection';
COMMENT ON TABLE redemption_rules IS 'Time and rule-based redemption controls';
COMMENT ON TABLE admin_overrides IS 'Audit trail of admin actions with mandatory reason codes';

