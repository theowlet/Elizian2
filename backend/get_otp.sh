#!/bin/bash
# Get the most recent OTP for a phone number

if [ -z "$1" ]; then
  echo "Usage: ./get_otp.sh <phone_number>"
  echo "Example: ./get_otp.sh 9876543210"
  echo ""
  echo "Or just run without args to see all recent OTPs from terminal logs:"
  echo ""
  tail -30 server-debug.log 2>/dev/null | grep "🔐 OTP" || echo "No OTPs found in logs. Check terminal output."
  exit 0
fi

PHONE=$1
echo "Checking terminal logs for OTP sent to: $PHONE"
echo "============================================"
grep "🔐 OTP for $PHONE" server-debug.log 2>/dev/null | tail -1 || echo "No OTP found in logs for $PHONE"
