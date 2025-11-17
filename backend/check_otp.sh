#!/bin/bash
# Quick script to check recent OTPs from database

echo "Recent OTPs (last 5):"
echo "===================="
PGPASSWORD=postgres psql -h localhost -U postgres -d elizian -c "
SELECT 
  phone_number,
  created_at,
  expires_at,
  verified,
  attempts
FROM otp_sessions 
ORDER BY created_at DESC 
LIMIT 5;
" -x

echo ""
echo "Note: OTP codes are hashed in the database for security."
echo "Check your backend terminal output to see the actual OTP code."
