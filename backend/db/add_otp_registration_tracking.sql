-- ============================================
-- DATABASE MIGRATION - Add OTP Registration Tracking
-- ============================================

-- Add column to track if OTP was used for registration
ALTER TABLE otp_sessions 
ADD COLUMN IF NOT EXISTS used_for_registration BOOLEAN DEFAULT FALSE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone_verified 
ON otp_sessions(phone_number, verified, verified_at);

-- Add index for registration tracking
CREATE INDEX IF NOT EXISTS idx_otp_sessions_registration 
ON otp_sessions(phone_number, used_for_registration, verified_at);

-- Update existing records to have default value
UPDATE otp_sessions 
SET used_for_registration = FALSE 
WHERE used_for_registration IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN otp_sessions.used_for_registration IS 'Tracks if OTP was used for user registration to prevent reuse';




