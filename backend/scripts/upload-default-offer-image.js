#!/usr/bin/env node
/**
 * Upload the default offer image to S3 at uploads/default-offer.jpg.
 * Run from backend: node scripts/upload-default-offer-image.js
 * Requires: AWS_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Offers with no image_url will use this S3 URL (same pattern as other deals).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const { s3, BUCKET_NAME, getS3FileUrl } = require('../utils/s3Bucket');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const KEY = 'uploads/default-offer.jpg';

async function main() {
  if (!BUCKET_NAME) {
    console.error('AWS_BUCKET_NAME is not set. Set env and retry.');
    process.exit(1);
  }
  const projectRoot = path.resolve(__dirname, '../..');
  const defaultImagePath = path.join(projectRoot, 'frontend', 'public', 'assets', 'default-offer.jpg');
  if (!fs.existsSync(defaultImagePath)) {
    console.error('Default image not found at:', defaultImagePath);
    process.exit(1);
  }
  const buffer = fs.readFileSync(defaultImagePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: KEY,
      Body: buffer,
      ContentType: 'image/jpeg',
    })
  );
  console.log('Uploaded default offer image to S3:', getS3FileUrl(KEY));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
