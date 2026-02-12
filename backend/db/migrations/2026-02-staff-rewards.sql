-- Staff / Employee Rewards: link staff (users) to partners, record check-ins, award EZT

-- Partner staff: which users are staff for which partner
CREATE TABLE IF NOT EXISTS partner_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_staff_partner ON partner_staff(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_staff_user ON partner_staff(user_id);

-- Staff check-ins: audit of check-ins and EZT earned (staff earn EZT when they check in at work)
CREATE TABLE IF NOT EXISTS staff_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ezt_earned DECIMAL(12, 5) DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_check_ins_partner ON staff_check_ins(partner_id);
CREATE INDEX IF NOT EXISTS idx_staff_check_ins_user ON staff_check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_check_ins_at ON staff_check_ins(checked_in_at DESC);

COMMENT ON TABLE partner_staff IS 'Users who are staff/employees of a partner; can receive EZT on check-in';
COMMENT ON TABLE staff_check_ins IS 'Audit of staff check-ins and EZT awarded';
