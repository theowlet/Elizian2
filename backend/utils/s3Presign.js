const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3, BUCKET_NAME, getS3FileUrl } = require('./s3Bucket');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const PRESIGN_EXPIRES = 300; // 5 min

function getAvatarObjectKey(userId, cardId, variant) {
  const v = ['original', 'filtered', 'thumbnail'].includes(String(variant)) ? variant : 'original';
  const ext = v === 'thumbnail' ? 'jpg' : 'jpg';
  return `avatars/${userId}/${cardId}/${v}.${ext}`;
}

async function getPresignedPutUrl(key, contentType) {
  if (!BUCKET_NAME) throw new Error('AWS_BUCKET_NAME not set');
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME.includes(mime)) {
    throw new Error('Invalid content type. Allowed: image/jpeg, image/png, image/webp');
  }
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mime,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });
  const finalUrl = getS3FileUrl(key);
  return { uploadUrl, key, finalUrl };
}

module.exports = {
  getAvatarObjectKey,
  getPresignedPutUrl,
  ALLOWED_MIME,
  MAX_SIZE,
};
