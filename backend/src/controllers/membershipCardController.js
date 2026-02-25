const membershipCardRepository = require('../repositories/membershipCardRepository');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../../utils/logger');
const { getAvatarObjectKey, getPresignedPutUrl, ALLOWED_MIME, MAX_SIZE } = require('../../utils/s3Presign');
const { uploadBufferToKey, getS3FileUrl } = require('../../utils/s3Bucket');

async function getMyCards(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : 24;
    const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : 0;
    const { rows, total, limit: actualLimit, offset: actualOffset } = await membershipCardRepository.getCardsByUserId(userId, { limit, offset });
    successResponse(res, 200, 'Membership cards retrieved', {
      items: rows,
      total,
      limit: actualLimit,
      offset: actualOffset,
    });
  } catch (err) {
    logError('Membership cards list error', err);
    return successResponse(res, 200, 'Membership cards retrieved', { items: [], total: 0, limit: 24, offset: 0 });
  }
}

async function getCardNftMetadata(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { cardId } = req.params;
    const numericId = parseInt(cardId, 10);
    if (Number.isNaN(numericId)) {
      return errorResponse(res, 400, 'Invalid card id');
    }
    const card = await membershipCardRepository.getCardByIdForUser(userId, numericId);
    if (!card) {
      return errorResponse(res, 404, 'Membership card not found');
    }
    return successResponse(res, 200, 'Membership card NFT metadata', {
      card_id: card.id,
      partner_id: card.partner_id,
      nft_metadata: card.nft_metadata,
    });
  } catch (err) {
    logError('Membership card NFT metadata error', err);
    return errorResponse(res, 500, 'Failed to fetch membership card metadata');
  }
}

async function getAvatarUploadUrl(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { cardId } = req.params;
    const numericId = parseInt(cardId, 10);
    if (Number.isNaN(numericId)) return errorResponse(res, 400, 'Invalid card id');
    const card = await membershipCardRepository.getCardByIdForUser(userId, numericId);
    if (!card) return errorResponse(res, 404, 'Membership card not found');
    const variant = (req.body?.variant || req.query?.variant || 'original').toLowerCase();
    const contentType = req.body?.contentType || req.query?.contentType || 'image/jpeg';
    if (!ALLOWED_MIME.includes(contentType.split(';')[0].trim())) {
      return errorResponse(res, 400, 'Allowed types: image/jpeg, image/png, image/webp');
    }
    const key = getAvatarObjectKey(userId, numericId, variant);
    const { uploadUrl, key: outKey, finalUrl } = await getPresignedPutUrl(key, contentType);
    return successResponse(res, 200, 'Presigned upload URL', {
      uploadUrl,
      key: outKey,
      finalUrl,
      maxSize: MAX_SIZE,
    });
  } catch (err) {
    logError('Avatar upload URL error', err);
    return errorResponse(res, 500, err.message || 'Failed to generate upload URL');
  }
}

async function updateCardAvatar(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { cardId } = req.params;
    const numericId = parseInt(cardId, 10);
    if (Number.isNaN(numericId)) return errorResponse(res, 400, 'Invalid card id');
    const card = await membershipCardRepository.getCardByIdForUser(userId, numericId);
    if (!card) return errorResponse(res, 404, 'Membership card not found');
    const { avatar_type, avatar_original_url, avatar_display_url, avatar_filter_type, avatar_metadata } = req.body || {};
    const updated = await membershipCardRepository.updateCardAvatar(userId, numericId, {
      avatar_type,
      avatar_original_url,
      avatar_display_url,
      avatar_filter_type,
      avatar_metadata,
    });
    return successResponse(res, 200, 'Card avatar updated', updated);
  } catch (err) {
    logError('Update card avatar error', err);
    return errorResponse(res, 400, err.message || 'Failed to update avatar');
  }
}

/**
 * Proxy upload: client sends multipart image; server uploads to S3 and saves URL.
 * Avoids S3 CORS by not requiring the browser to PUT directly to S3.
 */
async function uploadCardAvatar(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const { cardId } = req.params;
    const numericId = parseInt(cardId, 10);
    if (Number.isNaN(numericId)) return errorResponse(res, 400, 'Invalid card id');
    const card = await membershipCardRepository.getCardByIdForUser(userId, numericId);
    if (!card) return errorResponse(res, 404, 'Membership card not found');
    if (!req.file || !req.file.buffer) return errorResponse(res, 400, 'No image file provided');
    const contentType = req.file.mimetype && req.file.mimetype.startsWith('image/')
      ? req.file.mimetype
      : 'image/jpeg';
    if (!ALLOWED_MIME.includes(contentType.split(';')[0].trim())) {
      return errorResponse(res, 400, 'Allowed types: image/jpeg, image/png, image/webp');
    }
    const key = getAvatarObjectKey(userId, numericId, 'original');
    await uploadBufferToKey(req.file.buffer, contentType, key);
    const finalUrl = getS3FileUrl(key);
    await membershipCardRepository.updateCardAvatar(userId, numericId, {
      avatar_type: 'upload',
      avatar_original_url: finalUrl,
      avatar_display_url: finalUrl,
    });
    return successResponse(res, 200, 'Card avatar uploaded', { avatar_url: finalUrl });
  } catch (err) {
    logError('Upload card avatar error', err);
    return errorResponse(res, 500, err.message || 'Failed to upload avatar');
  }
}

module.exports = { getMyCards, getCardNftMetadata, getAvatarUploadUrl, updateCardAvatar, uploadCardAvatar };
