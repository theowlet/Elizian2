# Voucher Redemption System - Setup Guide

## Overview
Complete setup guide for the Voucher & Redemption System with QR codes, financial capture, and audit trails.

## Prerequisites

1. **PostgreSQL Database** (version 12+)
2. **AWS S3 Account** (for QR code storage)
3. **Node.js** (v14+)
4. **Backend dependencies installed**

## Step 1: Configure AWS S3

Set the following environment variables in your `.env` file:

```bash
AWS_BUCKET_NAME=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

**Note:** Ensure the S3 bucket exists and your AWS credentials have `PutObject` permissions.

## Step 2: Run Database Migration

### Option A: Using the Migration Script (Recommended)

```bash
cd backend
node run-voucher-redemption-migration.js
```

### Option B: Manual SQL Execution

```bash
psql -U your_user -d your_database -f db/migrations/2025-01-22-voucher-redemption-system.sql
```

### What the Migration Does:

1. **Adds `voucher_code` column** to `bookings` table (UUID, unique, immutable)
2. **Adds `qr_code_url` column** to `bookings` table (S3 URL)
3. **Creates `redemption_audit` table** for immutable audit trail
4. **Adds indexes** for performance
5. **Adds `voucher_redeemed` notification type** to notifications table

## Step 3: Verify Migration

Run these SQL queries to verify:

```sql
-- Check voucher_code column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name IN ('voucher_code', 'qr_code_url');

-- Check redemption_audit table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'redemption_audit';

-- Check notification type constraint
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'notifications_notification_type_check';
```

## Step 4: Test QR Code Generation

1. **Create a test booking** via the API:
   ```bash
   POST /api/v1/bookings
   {
     "offer_id": "your-offer-id",
     "num_tickets": 1,
     "reservation_data": {
       "date": "2025-01-25",
       "time": "19:00"
     }
   }
   ```

2. **Verify QR code was generated**:
   ```sql
   SELECT id, booking_reference, voucher_code, qr_code_url 
   FROM bookings 
   WHERE id = 'your-booking-id';
   ```

3. **Check S3 bucket** for the uploaded QR code image.

## Step 5: Test Redemption Flow

1. **Redeem a voucher** (as partner):
   ```bash
   POST /api/v1/redemptions/redeem
   {
     "voucher_code": "voucher-uuid",
     "total_bill_amount": 1000.00,
     "ezt_co_pay_amount": 100.00,
     "net_amount_from_user": 900.00,
     "redemption_notes": "Test redemption"
   }
   ```

2. **Verify redemption record**:
   ```sql
   SELECT * FROM redemption_audit WHERE voucher_code = 'voucher-uuid';
   ```

3. **Check notifications**:
   ```sql
   SELECT * FROM notifications 
   WHERE notification_type = 'voucher_redeemed' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

## Step 6: Frontend Verification

1. **View Booking History**: Navigate to `/bookings`
   - Should see QR code previews
   - Click QR code to open modal

2. **View Booking Details**: Navigate to `/booking/:id`
   - Should see full QR code
   - Download button should work

3. **Test QR Code Display**:
   - Verify QR code images load from S3
   - Verify voucher codes display correctly
   - Test download functionality

## Troubleshooting

### QR Code Not Generated

**Issue**: `qr_code_url` is NULL after booking creation

**Solutions**:
1. Check AWS S3 credentials are correct
2. Verify S3 bucket exists and is accessible
3. Check backend logs for QR generation errors
4. Ensure `qrcode` npm package is installed

### Migration Fails

**Issue**: Migration script fails with constraint errors

**Solutions**:
1. Check if columns already exist (migration is idempotent)
2. Verify PostgreSQL version (12+ required)
3. Check database permissions
4. Review error logs for specific constraint issues

### Redemption Fails

**Issue**: Redemption returns 403 or 409 error

**Solutions**:
1. Verify voucher code exists and is not already redeemed
2. Check partner authentication
3. Verify financial amounts are correct (net = total - ezt_co_pay)
4. Check booking status (must be 'confirmed' or 'pending')

### Notifications Not Sent

**Issue**: No notifications created after redemption

**Solutions**:
1. Verify `voucher_redeemed` is in notification_type constraint
2. Check notification service logs
3. Verify user/partner/admin IDs exist
4. Check notification table for records

## API Endpoints Reference

### Booking Creation
- **POST** `/api/v1/bookings`
- **Auth**: Required (User token)
- **Response**: Booking with `voucher_code` and `qr_code_url`

### Redemption
- **POST** `/api/v1/redemptions/redeem`
- **Auth**: Required (Partner token)
- **Body**: `{ voucher_code, total_bill_amount, ezt_co_pay_amount, net_amount_from_user }`
- **Response**: Redemption record with audit details

### Get Redemption by Voucher Code
- **GET** `/api/v1/redemptions/voucher/:voucher_code`
- **Auth**: Required
- **Response**: Redemption details

### Get Redemption Audit Trail
- **GET** `/api/v1/redemptions/booking/:bookingId`
- **Auth**: Required
- **Response**: Array of redemption records

## Database Schema

### Bookings Table (New Columns)
```sql
voucher_code UUID UNIQUE DEFAULT gen_random_uuid()
qr_code_url VARCHAR(500)
```

### Redemption Audit Table
```sql
CREATE TABLE redemption_audit (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL,
  voucher_code UUID NOT NULL,
  redeemed_by_partner_id UUID NOT NULL,
  redeemed_at TIMESTAMP NOT NULL,
  redemption_status VARCHAR(20) DEFAULT 'redeemed',
  total_bill_amount DECIMAL(12, 2) NOT NULL,
  ezt_co_pay_amount DECIMAL(12, 2) NOT NULL,
  net_amount_from_user DECIMAL(12, 2) NOT NULL,
  redeemed_by_user_id UUID,
  redemption_notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL
);
```

## Security Considerations

1. **Voucher Codes**: UUID v4 (non-guessable, globally unique)
2. **QR Codes**: Stored in S3 with controlled access
3. **Redemption**: Idempotent (cannot redeem twice)
4. **Financial Validation**: Server-side validation of all amounts
5. **Audit Trail**: Immutable records for compliance

## Performance Notes

- **QR Code Generation**: Done once at booking time (no regeneration)
- **S3 Storage**: Zero compute cost on repeated access
- **Indexes**: Optimized for voucher_code and booking_id lookups
- **Notifications**: Non-blocking (sent after transaction commit)

## Next Steps

1. ✅ Run migration
2. ✅ Configure AWS S3
3. ✅ Test booking creation
4. ✅ Test redemption flow
5. ✅ Verify frontend display
6. ⏭️ Partner console integration (redemption UI)
7. ⏭️ Admin audit dashboard
8. ⏭️ Analytics and reporting

## Support

For issues or questions:
1. Check backend logs: `backend/logs/`
2. Review migration logs
3. Verify database schema matches expected structure
4. Test API endpoints with Postman/curl

---

**Last Updated**: 2025-01-22
**Version**: 1.0.0

