const QRCode = require('qrcode');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { uploadToS3, BUCKET_NAME, getS3FileUrl } = require('../../utils/s3Bucket');
const { log, logError } = require('../../utils/logger');
const { AppError } = require('../../utils/response');

/** Save QR code to local uploads/vouchers/ when S3 is unavailable or fails. */
async function saveQRCodeLocally(voucherCode, buffer) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'vouchers');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `qr_${voucherCode}.png`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  const url = `/uploads/vouchers/${filename}`;
  log(`✅ QR code saved locally: ${url}`);
  return url;
}

/**
 * Generate QR code for voucher and upload to S3.
 * QR v3: Encodes only a compact deep link URL (~56 bytes) for fast, reliable scanning.
 * Booking details are displayed AROUND the QR in the UI, not encoded inside it.
 *
 * @param {string} voucherCode - UUID voucher code
 * @param {Object} metadata - Metadata for logging/audit (NOT encoded in QR)
 * @returns {Promise<string>} S3 URL of the QR code image
 */
async function generateAndUploadQRCode(voucherCode, metadata = {}) {
  try {
    if (!voucherCode) {
      throw new AppError(400, 'Voucher code is required for QR generation');
    }

    // QR v3: Encode only the deep link URL — compact, scannable, future-proof
    const qrContent = `https://elizian.in/v/${voucherCode}`;

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

    // Upload to S3 when configured; otherwise fall back to local storage
    let qrCodeUrl;
    if (BUCKET_NAME) {
      const qrFile = {
        buffer: finalQrBuffer,
        originalname: `qr-${voucherCode}.png`,
        mimetype: 'image/png'
      };
      try {
        const s3Key = await uploadToS3(qrFile);
        if (s3Key && typeof s3Key === 'string') {
          qrCodeUrl = getS3FileUrl(s3Key);
          log(`✅ QR code uploaded to S3: ${qrCodeUrl}`);
        } else {
          throw new Error('S3 upload returned invalid key');
        }
      } catch (s3Error) {
        logError('⚠️ S3 upload failed for QR code, falling back to local storage:', s3Error.message);
        qrCodeUrl = await saveQRCodeLocally(voucherCode, finalQrBuffer);
      }
    } else {
      log('⚠️ S3 not configured, saving QR code locally');
      qrCodeUrl = await saveQRCodeLocally(voucherCode, finalQrBuffer);
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
 * Used for testing or temporary display.
 * QR v3: Encodes only deep link URL.
 *
 * @param {string} voucherCode - UUID voucher code
 * @param {Object} metadata - Unused (kept for API compatibility)
 * @returns {Promise<string>} Data URL of QR code
 */
async function generateQRCodeDataURL(voucherCode, metadata = {}) {
  try {
    const qrContent = `https://elizian.in/v/${voucherCode}`;

    const dataURL = await QRCode.toDataURL(qrContent, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H'
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

