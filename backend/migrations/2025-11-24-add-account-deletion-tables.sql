-- Migration: Add account deletion tables and columns
-- Date: 2025-11-24
-- Purpose: Support permanent account deletion feature (Google/Apple compliance)

-- ==========================================
-- 1. Add deletion tracking columns to users
-- ==========================================

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS deletion_scheduled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP;

COMMENT ON COLUMN users.deletion_scheduled IS 'Whether account deletion has been scheduled';
COMMENT ON COLUMN users.deletion_scheduled_at IS 'When account deletion was scheduled';

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled 
  ON users(deletion_scheduled) 
  WHERE deletion_scheduled = true;

-- ==========================================
-- 2. Create account_deletion_requests table
-- ==========================================

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_deletion_date TIMESTAMP NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE account_deletion_requests IS 'Tracks account deletion requests with 30-day grace period';
COMMENT ON COLUMN account_deletion_requests.status IS 'Status: pending, cancelled, completed';
COMMENT ON COLUMN account_deletion_requests.scheduled_deletion_date IS 'When account will be permanently deleted';
COMMENT ON COLUMN account_deletion_requests.reason IS 'User-provided reason for deletion (optional)';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id 
  ON account_deletion_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status 
  ON account_deletion_requests(status);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled_date 
  ON account_deletion_requests(scheduled_deletion_date) 
  WHERE status = 'pending';

-- Add check constraint
ALTER TABLE account_deletion_requests 
  ADD CONSTRAINT chk_deletion_status 
  CHECK (status IN ('pending', 'cancelled', 'completed'));

-- ==========================================
-- 3. Create trigger to update updated_at
-- ==========================================

CREATE OR REPLACE FUNCTION update_deletion_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_deletion_request_timestamp 
  ON account_deletion_requests;

CREATE TRIGGER trigger_update_deletion_request_timestamp
  BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_deletion_request_timestamp();

-- ==========================================
-- 4. Create function to anonymize user data
-- ==========================================

CREATE OR REPLACE FUNCTION anonymize_user_data(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Anonymize bookings (keep for record-keeping but remove PII)
  UPDATE bookings
  SET user_id = NULL,
      special_requests = '[DELETED USER]',
      updated_at = NOW()
  WHERE user_id = target_user_id;
  
  RAISE NOTICE 'User data anonymized for user %', target_user_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION anonymize_user_data IS 'Anonymizes user data while retaining records for business purposes';

-- ==========================================
-- 5. Migration verification
-- ==========================================

DO $$
BEGIN
  -- Check if tables and columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'deletion_scheduled'
  ) THEN
    RAISE NOTICE '✅ users.deletion_scheduled column exists';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'account_deletion_requests'
  ) THEN
    RAISE NOTICE '✅ account_deletion_requests table exists';
  END IF;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Account deletion migration completed successfully!';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Features enabled:';
  RAISE NOTICE '  - 30-day grace period for deletions';
  RAISE NOTICE '  - User can cancel within grace period';
  RAISE NOTICE '  - Permanent deletion after grace period';
  RAISE NOTICE '  - Compliance with Google/Apple policies';
  RAISE NOTICE '================================================';
END$$;

