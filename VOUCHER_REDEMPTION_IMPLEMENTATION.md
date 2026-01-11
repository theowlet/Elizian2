# Voucher & Redemption System Implementation

## Overview
This document describes the secure, auditable, and scalable Deal Booking & Redemption Flow implementation.

## Features Implemented

### 1. Deal Booking with Trackable Voucher Code
- **Voucher Code**: UUID v4 generated at booking time
- **Immutable**: Once created, voucher code never changes
- **Globally Unique**: Database-level UNIQUE constraint
- **Single Source of Truth**: Used for all redemptions, audits, and lookups

### 2. Persistent QR Code
- **Generation**: QR code generated once at booking time
- **Storage**: Uploaded to AWS S3 (or compatible object storage)
- **Persistence**: S3 URL stored in `bookings.qr_code_url`
- **Never Regenerated**: QR code is immutable after creation
- **Zero Compute Cost**: QR code served from S3 on repeated access

### 3. Redemption Flow
- **Idempotent**: Cannot be redeemed twice (database constraint)
- **Status Transitions**: `pending/confirmed` → `redeemed` (strict)
- **Timestamped**: `redeemed_at` recorded in audit trail
- **Partner-Linked**: Redemption linked to redeeming partner
- **Financial Capture**: Total bill, EZT co-pay, net amount required

### 4. Financial Capture at Redemption
- **Total Bill Amount**: Required, validated server-side
- **EZT Co-Pay Amount**: Required, validated server-side
- **Net Amount from User**: Required, validated server-side
- **Validation**: `net_amount_from_user = total_bill_amount - ezt_co_pay_amount`
- **Permanent Storage**: All financial data stored in `redemption_audit` table

### 5. Notifications
- **User Notification**: Sent when voucher is redeemed
- **Partner Notification**: Sent to partner account (if exists)
- **Admin Notification**: Bulk notification to all admins
- **In-App**: All notifications stored in `notifications` table

### 6. Audit Trail
- **Immutable Records**: `redemption_audit` table stores all redemptions
- **Queryable**: Indexed by booking_id, voucher_code, partner_id, redeemed_at
- **Metadata**: JSONB field for additional audit data
- **Reversals**: Support for `redemption_status = 'reversed'` (future)

## Database Schema

### Bookings Table (New Fields)
```sql
voucher_code UUID UNIQUE DEFAULT gen_random_uuid()
qr_code_url VARCHAR(500)
```

### Redemption Audit Table
```sql
CREATE TABLE redemption_audit (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id),
  voucher_code UUID NOT NULL REFERENCES bookings(voucher_code),
  redeemed_by_partner_id UUID NOT NULL REFERENCES partners(id),
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redemption_status VARCHAR(20) DEFAULT 'redeemed',
  total_bill_amount DECIMAL(12, 2) NOT NULL,
  ezt_co_pay_amount DECIMAL(12, 2) NOT NULL,
  net_amount_from_user DECIMAL(12, 2) NOT NULL,
  redeemed_by_user_id UUID REFERENCES users(id),
  redemption_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### POST `/api/v1/redemptions/redeem`
Redeem a voucher (partner authentication required)

**Request Body:**
```json
{
  "voucher_code": "uuid-v4",
  "total_bill_amount": 1000.00,
  "ezt_co_pay_amount": 100.00,
  "net_amount_from_user": 900.00,
  "redemption_notes": "Optional notes"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voucher redeemed successfully",
  "data": {
    "id": "redemption-uuid",
    "booking_id": "booking-uuid",
    "voucher_code": "voucher-uuid",
    "redeemed_at": "2025-01-22T10:00:00Z",
    "total_bill_amount": 1000.00,
    "ezt_co_pay_amount": 100.00,
    "net_amount_from_user": 900.00
  }
}
```

### GET `/api/v1/redemptions/voucher/:voucher_code`
Get redemption details by voucher code

### GET `/api/v1/redemptions/booking/:bookingId`
Get redemption audit trail for a booking

## Files Created/Modified

### New Files
1. `backend/db/migrations/2025-01-22-voucher-redemption-system.sql` - Database migration
2. `backend/src/utils/qrCodeGenerator.js` - QR code generation utility
3. `backend/src/services/redemptionService.js` - Redemption business logic
4. `backend/src/controllers/redemptionController.js` - Redemption API controller
5. `backend/src/routes/redemptionRoutes.js` - Redemption routes

### Modified Files
1. `backend/src/services/bookingService.js` - Added voucher code and QR generation
2. `backend/src/repositories/bookingRepository.js` - Added voucher_code and qr_code_url fields
3. `backend/src/app.js` - Added redemption routes

## Usage Flow

### 1. Booking Creation
```javascript
// When a booking is created:
// 1. Voucher code (UUID v4) is generated
// 2. QR code is generated with voucher code + metadata
// 3. QR code is uploaded to S3
// 4. S3 URL is stored in bookings.qr_code_url
// 5. Voucher code is stored in bookings.voucher_code
```

### 2. Voucher Redemption
```javascript
// Partner redeems voucher:
// 1. Partner scans QR code or enters voucher_code
// 2. Partner enters financial details (bill, EZT co-pay, net)
// 3. System validates:
//    - Voucher exists and not already redeemed
//    - Partner matches booking partner
//    - Financial calculation is correct
// 4. Booking status updated to 'redeemed'
// 5. Redemption audit record created
// 6. Notifications sent to user, partner, admin
```

## Security & Best Practices

✅ **Atomic Transactions**: All redemption operations in single transaction
✅ **Idempotent Redemption**: Database constraint prevents double redemption
✅ **Immutable Audit Trail**: Redemption records never modified
✅ **Role-Based Access**: Partner authentication required for redemption
✅ **Server-Side Validation**: All financial calculations validated
✅ **Status Transitions**: Strict state machine (pending → redeemed)
✅ **Zero Compute on Access**: QR codes served from S3

## Next Steps (Frontend)

1. Display QR code in booking history
2. Partner console: Redemption interface with financial capture
3. Admin console: Redemption audit view
4. User notification display for redemption events

## Migration Instructions

Run the migration:
```bash
psql -U your_user -d your_database -f backend/db/migrations/2025-01-22-voucher-redemption-system.sql
```

Or via Node.js:
```javascript
const pool = require('./src/config/db').getPool();
const fs = require('fs');
const migrationSQL = fs.readFileSync('./db/migrations/2025-01-22-voucher-redemption-system.sql', 'utf8');
await pool.query(migrationSQL);
```

## Environment Variables Required

- `AWS_BUCKET_NAME` - S3 bucket name for QR code storage
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

## Testing

1. Create a booking → Verify voucher_code and qr_code_url are set
2. Redeem voucher → Verify redemption record created
3. Try to redeem again → Should fail with 409 (already redeemed)
4. Check notifications → User, partner, admin should receive notifications
5. Query audit trail → Should return redemption history

