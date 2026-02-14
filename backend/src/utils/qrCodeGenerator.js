const QRCode = require('qrcode');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { uploadToS3 } = require('../../utils/s3Bucket');
const { log, logError } = require('../../utils/logger');
const { AppError } = require('../../utils/response');

/**
 * Generate QR code for voucher and upload to S3
 * @param {string} voucherCode - UUID voucher code
 * @param {Object} metadata - Additional metadata to encode (optional)
 * @param {string} metadata.booking_reference - Human-readable booking reference
 * @param {string} metadata.deal_title - Deal/Event name
 * @param {string} metadata.partner_name - Partner name
 * @param {string} metadata.booking_date - Booking date
 * @param {string} metadata.booking_time - Booking time
 * @param {string} metadata.booking_id - Booking ID (for backend processing)
 * @param {string} metadata.partner_id - Partner ID (for backend processing)
 * @returns {Promise<string>} S3 URL of the QR code image
 */
async function generateAndUploadQRCode(voucherCode, metadata = {}) {
  try {
    if (!voucherCode) {
      throw new AppError(400, 'Voucher code is required for QR generation');
    }

    // Format date and time for human readability
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      } catch (e) {
        return dateString;
      }
    };

    const formatTime = (timeString) => {
      if (!timeString) return '';
      try {
        // If it's a full datetime, extract time
        if (timeString.includes('T')) {
          const date = new Date(timeString);
          return date.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true
          });
        }
        // If it's just time (HH:MM), format it
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
      } catch (e) {
        return timeString;
      }
    };

    // Format currency for display
    const formatAmount = (amt) => {
      if (!amt && amt !== 0) return null;
      return `₹${parseFloat(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Build human-readable QR code content with full voucher details
    const humanReadableContent = [
      '════════════════════════',
      '   ELIZIAN VOUCHER',
      '════════════════════════',
      '',
      `Ref: ${metadata.booking_reference || 'N/A'}`,
      `Guest: ${metadata.guest_name || 'N/A'}`,
      metadata.user_tier ? `Tier: ${metadata.user_tier}` : '',
      `Deal: ${metadata.deal_title || 'N/A'}`,
      metadata.partner_name ? `Venue: ${metadata.partner_name}` : '',
      metadata.num_guests ? `Guests: ${metadata.num_guests}` : '',
      metadata.booking_date ? `Date: ${formatDate(metadata.booking_date)}` : '',
      metadata.booking_time ? `Time: ${formatTime(metadata.booking_time)}` : '',
      '',
      metadata.total_amount != null ? `Amount: ${formatAmount(metadata.total_amount)}` : '',
      metadata.ezt_redeemed ? `EZT Used: ${metadata.ezt_redeemed}` : '',
      metadata.expires_at ? `Valid Until: ${formatDate(metadata.expires_at)}` : '',
      '',
      `Voucher: ${voucherCode}`,
      '',
      '════════════════════════',
      'Scan at venue for redemption',
      '════════════════════════'
    ].filter(line => line !== '').join('\n');

    // Also include technical data in JSON format for backend processing
    const technicalData = {
      voucher_code: voucherCode,
      booking_reference: metadata.booking_reference,
      booking_id: metadata.booking_id,
      partner_id: metadata.partner_id,
      user_id: metadata.user_id,
      user_tier: metadata.user_tier || null,
      total_amount: metadata.total_amount || 0,
      original_amount: metadata.original_amount || 0,
      ezt_redeemed: metadata.ezt_redeemed || 0,
      booking_type: metadata.booking_type || null,
      voucher_state: metadata.voucher_state || 'active',
      expires_at: metadata.expires_at || null,
      type: 'voucher',
      version: 2
    };

    // Combine human-readable and technical data
    // Format: Human-readable text, followed by JSON for machine processing
    const qrContent = `${humanReadableContent}\n\n---\n${JSON.stringify(technicalData)}`;

    // Generate QR code as buffer (PNG format)
    const qrBuffer = await QRCode.toBuffer(qrContent, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H', // High error correction for better scanning
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    log(`✅ QR code generated for voucher: ${voucherCode} (${qrBuffer.length} bytes)`);

    // Embed Elizian logo in the center of QR code
    let finalQrBuffer = qrBuffer;
    try {
      // Try to load logo from frontend assets (relative to backend root)
      const logoPath = path.join(__dirname, '../../../frontend/public/assets/z.png');
      
      if (fs.existsSync(logoPath)) {
        // Load and resize logo to 20% of QR code size (102px for 512px QR)
        const logoSize = Math.floor(512 * 0.2);
        const logoBuffer = await sharp(logoPath)
          .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toBuffer();

        // Calculate center position for logo overlay
        const qrSize = 512;
        const logoX = Math.floor((qrSize - logoSize) / 2);
        const logoY = Math.floor((qrSize - logoSize) / 2);

        // Overlay logo on QR code
        finalQrBuffer = await sharp(qrBuffer)
          .composite([{
            input: logoBuffer,
            left: logoX,
            top: logoY
          }])
          .png()
          .toBuffer();

        log(`✅ Logo embedded in QR code`);
      } else {
        log(`⚠️ Logo not found at ${logoPath}, QR code generated without logo`);
      }
    } catch (logoError) {
      logError('⚠️ Failed to embed logo in QR code (continuing without logo):', logoError);
      // Continue with QR code without logo
      finalQrBuffer = qrBuffer;
    }

    // Prepare file object for S3 upload
    const qrFile = {
      buffer: finalQrBuffer,
      originalname: `qr-${voucherCode}.png`,
      mimetype: 'image/png'
    };

    // Upload to S3
    // CRITICAL: If S3 upload fails, throw error so caller can handle appropriately
    let qrCodeUrl;
    try {
      qrCodeUrl = await uploadToS3(qrFile);
      if (!qrCodeUrl || typeof qrCodeUrl !== 'string') {
        throw new Error('S3 upload returned invalid URL');
      }
      log(`✅ QR code uploaded to S3: ${qrCodeUrl}`);
    } catch (s3Error) {
      logError('❌ S3 upload failed for QR code:', {
        error: s3Error.message,
        voucherCode: voucherCode,
        fileSize: finalQrBuffer.length
      });
      // Re-throw so caller can decide whether to fail booking or continue
      throw new AppError(500, `Failed to upload QR code to S3: ${s3Error.message}`);
    }
    
    return qrCodeUrl;
  } catch (error) {
    logError('❌ QR code generation/upload error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Generate QR code data URL (for immediate display, not persisted)
 * Used for testing or temporary display
 * @param {string} voucherCode - UUID voucher code
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<string>} Data URL of QR code
 */
async function generateQRCodeDataURL(voucherCode, metadata = {}) {
  try {
    const qrData = {
      voucher_code: voucherCode,
      type: 'voucher',
      ...metadata
    };

    const dataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    return dataURL;
  } catch (error) {
    logError('❌ QR code data URL generation error:', error);
    throw new AppError(500, `Failed to generate QR code data URL: ${error.message}`);
  }
}

module.exports = {
  generateAndUploadQRCode,
  generateQRCodeDataURL
};

