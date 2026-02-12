-- EZ Club: cross-network loyalty tier (check-in based)
-- Qualify after N redemptions across any partner (default 5).

-- Add EZ Club columns to users (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ez_club_member') THEN
    ALTER TABLE users ADD COLUMN ez_club_member BOOLEAN DEFAULT false;
    COMMENT ON COLUMN users.ez_club_member IS 'True if user qualified for EZ Club (cross-network tier)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ez_club_network_check_ins') THEN
    ALTER TABLE users ADD COLUMN ez_club_network_check_ins INTEGER DEFAULT 0;
    COMMENT ON COLUMN users.ez_club_network_check_ins IS 'Count of redemptions across all partners (used for EZ Club qualification)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ez_club_qualified_at') THEN
    ALTER TABLE users ADD COLUMN ez_club_qualified_at TIMESTAMP;
    COMMENT ON COLUMN users.ez_club_qualified_at IS 'When user first qualified for EZ Club';
  END IF;
END $$;

-- Backfill ez_club_network_check_ins from redemption_audit (optional, one-time)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.user_id, COUNT(*) AS cnt
    FROM redemption_audit ra
    JOIN bookings b ON b.id = ra.booking_id
    WHERE ra.redemption_status = 'redeemed'
    GROUP BY b.user_id
  LOOP
    UPDATE users
    SET ez_club_network_check_ins = r.cnt,
        ez_club_member = (r.cnt >= 5),
        ez_club_qualified_at = CASE WHEN r.cnt >= 5 AND ez_club_qualified_at IS NULL THEN CURRENT_TIMESTAMP ELSE ez_club_qualified_at END
    WHERE id = r.user_id;
  END LOOP;
EXCEPTION
  WHEN undefined_column THEN NULL; -- columns may not exist yet in same migration run
END $$;

CREATE INDEX IF NOT EXISTS idx_users_ez_club_member ON users(ez_club_member) WHERE ez_club_member = true;
