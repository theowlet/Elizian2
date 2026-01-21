# Complete Setup Tasks 1-3

## Overview
This guide helps you complete the three essential setup tasks for the Voucher Redemption System.

## Tasks

### Task 1: Verify AWS S3 Configuration ✅
**Purpose**: Ensure AWS S3 is properly configured for QR code storage

**Run**:
```bash
cd backend
node scripts/verify-s3-config.js
```

**What it does**:
- Checks for required environment variables
- Tests S3 connection
- Verifies bucket accessibility
- Confirms credentials are valid

**Required Environment Variables**:
```bash
AWS_BUCKET_NAME=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

**Expected Output**:
```
✅ AWS_BUCKET_NAME: your-bucket-name
✅ AWS_REGION: us-east-1
✅ AWS_ACCESS_KEY_ID: **********
✅ AWS_SECRET_ACCESS_KEY: **********
✅ S3 connection successful!
✅ Bucket "your-bucket-name" exists and is accessible
✅ S3 Configuration Verified!
```

---

### Task 2: Run Database Migration ✅
**Purpose**: Add voucher_code, qr_code_url columns and redemption_audit table

**Run**:
```bash
cd backend
node run-voucher-redemption-migration.js
```

**What it does**:
- Adds `voucher_code` column to bookings table
- Adds `qr_code_url` column to bookings table
- Creates `redemption_audit` table
- Adds `voucher_redeemed` notification type
- Creates indexes for performance
- Verifies migration success

**Expected Output**:
```
🔄 Running Voucher Redemption System migration...
✅ Voucher Redemption System migration completed successfully!
   - Added voucher_code column to bookings table
   - Added qr_code_url column to bookings table
   - Created redemption_audit table
   - Created indexes for performance
   - Added unique constraint for idempotent redemption
✅ Verified: voucher_code and qr_code_url columns exist
✅ Verified: redemption_audit table exists
✅ Migration script completed
```

---

### Task 3: Test Booking Creation ✅
**Purpose**: Verify QR code generation works when creating a booking

**Run**:
```bash
cd backend
node scripts/test-booking-creation.js
```

**What it does**:
- Finds a test user in database
- Finds an active offer
- Creates a test booking
- Verifies voucher code generation
- Verifies QR code generation and upload
- Tests QR code URL accessibility
- Verifies database record

**Prerequisites**:
- At least one user in database
- At least one active offer in database
- AWS S3 configured (Task 1)
- Migration run (Task 2)

**Expected Output**:
```
🧪 Testing Booking Creation with QR Code Generation...
✅ Found test user: John Doe (9876543210)
✅ Found test offer: New Year Dinner Delight (dining)
📝 Creating test booking...
✅ Booking created successfully!
   Booking ID: abc-123-def
   Booking Reference: BK-1234567890-ABC
   Voucher Code: 550e8400-e29b-41d4-a716-446655440000
   QR Code URL: https://bucket.s3.region.amazonaws.com/uploads/qr-550e8400...
✅ QR Code Generation Verified!
   ✅ Voucher code: 550e8400-e29b-41d4-a716-446655440000
   ✅ QR code URL: https://bucket.s3.region.amazonaws.com/...
   ✅ QR code image is accessible from S3
✅ Database Record Verified!
🎉 All Tests Passed!
```

---

## Run All Tasks at Once

**Quick Setup** (runs all 3 tasks in sequence):
```bash
cd backend
node scripts/run-all-setup-tasks.js
```

This will:
1. Verify S3 configuration
2. Run database migration
3. Test booking creation

**Output**:
```
🚀 Starting Voucher Redemption System Setup...

============================================================
📋 Task: Task 1: Verify AWS S3 Configuration
============================================================
✅ Task 1: Verify AWS S3 Configuration completed successfully!

============================================================
📋 Task: Task 2: Run Database Migration
============================================================
✅ Task 2: Run Database Migration completed successfully!

============================================================
📋 Task: Task 3: Test Booking Creation
============================================================
✅ Task 3: Test Booking Creation completed successfully!

============================================================
📊 Setup Summary
============================================================

✅ Task 1: Verify AWS S3 Configuration
✅ Task 2: Run Database Migration
✅ Task 3: Test Booking Creation

🎉 All setup tasks completed successfully!
✨ Voucher Redemption System is ready to use!
```

---

## Troubleshooting

### Task 1 Fails: S3 Configuration

**Error**: `Missing required environment variables`
- **Solution**: Add AWS credentials to `.env` file

**Error**: `S3 Connection Failed`
- **Solution**: Check AWS credentials and region
- **Solution**: Verify bucket exists and is accessible

### Task 2 Fails: Migration

**Error**: `Column already exists`
- **Solution**: This is okay - migration is idempotent
- **Solution**: Migration may have already been run

**Error**: `Permission denied`
- **Solution**: Check database user permissions
- **Solution**: Ensure user can CREATE TABLE and ALTER TABLE

### Task 3 Fails: Booking Creation

**Error**: `No users found`
- **Solution**: Create a user first via signup or admin

**Error**: `No active offers found`
- **Solution**: Create an active offer via partner console

**Error**: `QR code generation failed`
- **Solution**: Check Task 1 (S3 configuration)
- **Solution**: Verify `qrcode` npm package is installed

---

## Manual Verification

### Check Database Schema
```sql
-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name IN ('voucher_code', 'qr_code_url');

-- Verify redemption_audit table
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'redemption_audit';

-- Check notification type
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'notifications_notification_type_check';
```

### Check S3 Bucket
```bash
aws s3 ls s3://your-bucket-name/uploads/ | grep qr-
```

### Check Recent Bookings
```sql
SELECT id, booking_reference, voucher_code, qr_code_url, created_at
FROM bookings
WHERE voucher_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

---

## Next Steps After Setup

1. ✅ **Create bookings** via frontend or API
2. ✅ **View QR codes** in booking history
3. ✅ **Test redemption** via partner console
4. ✅ **Verify notifications** are sent
5. ✅ **Check audit trail** in redemption_audit table

---

## Files Created

- `backend/scripts/verify-s3-config.js` - S3 configuration verifier
- `backend/scripts/test-booking-creation.js` - Booking creation tester
- `backend/scripts/run-all-setup-tasks.js` - All-in-one setup script

---

**Status**: ✅ All setup tasks ready to run
**Last Updated**: 2025-01-22

