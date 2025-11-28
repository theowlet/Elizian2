/**
 * Comprehensive Image Upload Utility
 * Handles base64 image validation, MIME type detection, Vercel compatibility, and error handling
 */

const path = require('path');
const fs = require('fs');
const { AppError } = require('./response');
const { log, logError } = require('./logger');

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validates base64 image data
 * Checks for valid format and image signatures
 */
function isValidBase64Image(base64Data) {
  if (!base64Data || typeof base64Data !== 'string') {
    return false;
  }

  // Clean base64 data (remove data URI prefix if present)
  let base64Clean = base64Data;
  const dataUriMatch = /^data:(.*?);base64,(.*)$/.exec(base64Data);
  if (dataUriMatch) {
    base64Clean = dataUriMatch[2];
  }

  // Check if it's valid base64
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Clean)) {
    return false;
  }

  // Image signatures (magic bytes)
  const imageSignatures = {
    '/9j/': 'image/jpeg',      // JPEG
    'iVBORw0KGgo': 'image/png', // PNG
    'R0lGODdh': 'image/gif',    // GIF (87a)
    'R0lGODlh': 'image/gif',    // GIF (89a)
    'UklGR': 'image/webp'       // WebP
  };

  // Check if data starts with any image signature
  return Object.keys(imageSignatures).some(sig => 
    base64Clean.startsWith(sig)
  );
}

/**
 * Extracts MIME type from base64 data
 * Tries data URI first, then image signature
 */
function getMimeTypeFromBase64(base64Data) {
  // Try data URI format first
  const dataUriMatch = /^data:(.*?);base64,/.exec(base64Data);
  if (dataUriMatch) {
    const mimeType = dataUriMatch[1];
    if (mimeType.startsWith('image/')) {
      return mimeType;
    }
  }

  // Extract base64 data
  let base64Clean = base64Data;
  if (dataUriMatch) {
    base64Clean = base64Data.substring(dataUriMatch[0].length);
  }

  // Check image signatures
  if (base64Clean.startsWith('/9j/')) return 'image/jpeg';
  if (base64Clean.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64Clean.startsWith('R0lGODdh') || base64Clean.startsWith('R0lGODlh')) return 'image/gif';
  if (base64Clean.startsWith('UklGR')) return 'image/webp';

  // Default to JPEG
  return 'image/jpeg';
}

/**
 * Gets file extension from MIME type
 */
function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
  };
  return mimeToExt[mimeType] || 'jpg';
}

/**
 * Get base URL for image URLs
 * Returns Vercel URL in production, localhost in development
 */
function getBaseUrl() {
  if (process.env.VERCEL) {
    // On Vercel, use the VERCEL_URL environment variable
    const vercelUrl = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return vercelUrl ? `https://${vercelUrl}` : 'https://your-app.vercel.app';
  }
  // Local development
  const config = require('../config/env');
  return `http://localhost:${config.server.port}`;
}

/**
 * Universal image upload handler
 * Works for orders, menu items, offers, and events
 * 
 * @param {string} image_base64 - Base64 encoded image data
 * @param {string} image_filename - Original filename (optional)
 * @param {string} subFolder - Subfolder in uploads (e.g., 'orders', 'menu', 'offers', 'events')
 * @param {string} prefix - Filename prefix (e.g., 'order', 'item', 'offer', 'event')
 * @returns {string} Image URL path (full URL on Vercel, relative path on localhost)
 */
function handleImageUpload(image_base64, image_filename, subFolder = 'uploads', prefix = 'image') {
  log(`🔍 handleImageUpload called: subFolder=${subFolder}, prefix=${prefix}, has_base64=${!!image_base64}, filename=${image_filename || 'none'}`);
  
  // Vercel compatibility - return data URL instead of file path
  if (process.env.VERCEL) {
    log('⚠️ Running on Vercel - returning base64 data URL');
    
    // Ensure it's a proper data URL
    if (!image_base64.startsWith('data:')) {
      const mimeType = getMimeTypeFromBase64(image_base64);
      return `data:${mimeType};base64,${image_base64}`;
    }
    return image_base64;
  }

  try {
    // Validate base64 image data
    log('🔍 Validating base64 image data...');
    if (!isValidBase64Image(image_base64)) {
      logError('❌ Base64 validation failed');
      throw new AppError(400, 
        'Invalid image data. Please provide a valid base64 encoded image (JPEG, PNG, GIF, or WebP)'
      );
    }
    log('✅ Base64 validation passed');

    // Extract base64 data and MIME type
    let base64Data = image_base64;
    const dataUriMatch = /^data:(.*?);base64,(.*)$/.exec(image_base64);
    if (dataUriMatch) {
      base64Data = dataUriMatch[2];
    }

    // Get MIME type and extension
    const mimeType = getMimeTypeFromBase64(image_base64);
    const extension = getExtensionFromMimeType(mimeType);

    // Validate buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (buffer.length === 0) {
      throw new AppError(400, 'Decoded image data is empty');
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new AppError(400, 
        `Image size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit (received: ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`
      );
    }

    // Create uploads directory
    // __dirname is backend/src/utils, so uploads are at backend/uploads
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', subFolder);
    const absolutePath = path.resolve(uploadsDir);
    log(`📁 Upload directory (relative): ${uploadsDir}`);
    log(`📁 Upload directory (absolute): ${absolutePath}`);
    
    if (!fs.existsSync(uploadsDir)) {
      log(`📁 Creating upload directory: ${uploadsDir}`);
      fs.mkdirSync(uploadsDir, { recursive: true });
      log(`✅ Upload directory created`);
    } else {
      log(`✅ Upload directory exists`);
    }

    // Create safe filename
    const safeName = (image_filename && image_filename.replace(/[^a-zA-Z0-9-_\.]/g, '')) 
      || `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
    
    const targetPath = path.join(uploadsDir, safeName);
    log(`📝 Target file path: ${targetPath}`);

    // Write file
    log(`💾 Writing file (${(buffer.length / 1024).toFixed(1)} KB)...`);
    fs.writeFileSync(targetPath, buffer);
    log(`✅ File written successfully`);

    // Verify file was written
    if (!fs.existsSync(targetPath)) {
      throw new Error(`File was not created at ${targetPath}`);
    }
    const stats = fs.statSync(targetPath);
    log(`✅ File verified: ${(stats.size / 1024).toFixed(1)} KB on disk`);

    // Return relative path for localhost (will be served by Express static middleware)
    const imageUrl = `/uploads/${subFolder}/${safeName}`;
    log(`✅ Image uploaded to: ${imageUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);
    log(`✅ Full URL would be: ${getBaseUrl()}${imageUrl}`);
    
    return imageUrl;
  } catch (error) {
    logError('Image upload error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `Image upload failed: ${error.message}`);
  }
}

/**
 * Deletes an old image file (non-blocking)
 * Used when updating images to clean up old files
 */
function deleteOldImage(imageUrl) {
  if (process.env.VERCEL || !imageUrl || !imageUrl.startsWith('/uploads/')) {
    return; // Skip on Vercel or if not a local file
  }

  try {
    // __dirname is backend/src/utils, so uploads are at backend/uploads
    const oldImagePath = path.join(
      __dirname, 
      '..', 
      '..', 
      'uploads', 
      imageUrl.replace('/uploads/', '') // Remove /uploads/ prefix to get relative path
    );

    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
      log(`🗑️ Deleted old image: ${imageUrl}`);
    }
  } catch (deleteErr) {
    logError('⚠️ Failed to delete old image:', deleteErr);
    // Continue anyway - don't fail the operation
  }
}

module.exports = {
  handleImageUpload,
  deleteOldImage,
  isValidBase64Image,
  getMimeTypeFromBase64,
  getExtensionFromMimeType,
  getBaseUrl,
  MAX_FILE_SIZE
};

