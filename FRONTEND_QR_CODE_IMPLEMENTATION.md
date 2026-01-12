# Frontend QR Code Display Implementation

## Overview
This document describes the frontend implementation for displaying QR codes in the booking history and booking details pages.

## Features Implemented

### 1. Booking History Page (`BookingHistory.jsx`)
- **QR Code Preview**: Displays QR code thumbnail (120x120px) for each booking
- **Click to View**: Clicking the QR code opens a full-screen modal
- **Voucher Code Display**: Shows truncated voucher code (first 8 characters)
- **Error Handling**: Gracefully handles missing or broken QR code images
- **Visual Feedback**: Hover effect on QR code preview

### 2. Booking Details Page (`BookingDetails.jsx`)
- **Full QR Code Display**: Large QR code (250x250px) in voucher card
- **Download Functionality**: Button to download QR code as PNG
- **Voucher Code**: Full voucher code displayed below QR code
- **Redemption Status**: Enhanced status display with voucher code snippet
- **Error Handling**: Fallback UI for missing QR codes

### 3. QR Code Modal Component (`QRCodeModal.jsx`)
- **Full-Screen Modal**: Large, centered QR code display
- **Download Button**: Direct download of QR code image
- **Voucher Code**: Full voucher code displayed
- **Booking Reference**: Shows booking reference number
- **Instructions**: Clear redemption instructions
- **Responsive**: Works on mobile and desktop

## Files Created/Modified

### New Files
1. `frontend/src/components/QRCodeModal.jsx` - Reusable QR code modal component

### Modified Files
1. `frontend/src/pages/BookingHistory.jsx` - Added QR code preview and modal
2. `frontend/src/pages/BookingDetails.jsx` - Enhanced QR code display with download

## UI/UX Features

### Booking History
- QR code preview card with hover effect
- Click to open full-screen modal
- Truncated voucher code for quick reference
- Status badge integration

### Booking Details
- Large QR code in voucher card
- Download button for offline access
- Full voucher code display
- Redemption instructions
- Enhanced status display

### QR Code Modal
- Full-screen overlay
- Large QR code (300x300px)
- Download functionality
- Voucher code and booking reference
- Clear redemption instructions

## Data Structure

The booking object now includes:
```javascript
{
  id: "uuid",
  booking_reference: "BK-...",
  voucher_code: "uuid-v4",      // New field
  qr_code_url: "https://...",   // New field (S3 URL)
  status: "confirmed" | "redeemed" | "pending" | "cancelled",
  // ... other booking fields
}
```

## Usage

### Viewing QR Codes
1. **From Booking History**: Click on any booking card's QR code preview
2. **From Booking Details**: QR code is displayed prominently in the voucher card
3. **Download**: Click "Download QR Code" button in details page or modal

### Redemption Flow
1. User receives booking confirmation with QR code
2. QR code is stored in booking history
3. User can view/download QR code anytime
4. At venue, user shows QR code to partner
5. Partner scans QR code or enters voucher code
6. Redemption is processed via partner console

## Error Handling

- **Missing QR Code**: Shows "Generating..." placeholder
- **Broken Image URL**: Shows error message with support contact
- **Network Errors**: Graceful fallback with user-friendly messages
- **Missing Voucher Code**: Handles gracefully (shows booking reference instead)

## Responsive Design

- **Mobile**: QR codes scale appropriately
- **Tablet**: Optimal sizing for touch interaction
- **Desktop**: Full-size display with hover effects

## Accessibility

- Alt text for QR code images
- Keyboard navigation support
- ARIA labels for modal close button
- Screen reader friendly error messages

## Next Steps (Optional Enhancements)

1. **QR Code Scanning**: Add camera-based QR code scanning for partners
2. **Share Functionality**: Share QR code via WhatsApp/Email
3. **Print View**: Optimized print layout for QR codes
4. **Offline Support**: Cache QR codes for offline viewing
5. **Analytics**: Track QR code views and downloads

## Testing Checklist

- [x] QR code displays correctly in booking history
- [x] QR code displays correctly in booking details
- [x] QR code modal opens and closes properly
- [x] Download functionality works
- [x] Error handling for missing/broken QR codes
- [x] Responsive design on mobile/tablet/desktop
- [x] Voucher code displays correctly
- [x] Status badges work with redeemed status

## Notes

- QR codes are generated once at booking time and stored in S3
- QR codes are never regenerated (immutable)
- QR code URLs are served directly from S3 (zero compute cost)
- Voucher codes are UUID v4 (globally unique, non-guessable)

