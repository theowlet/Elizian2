const { S3Client } = require("@aws-sdk/client-s3");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { crypto } = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Get bucket name from environment
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION || "us-east-1";
// Initialize the S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads one or more files to S3
 * @param {Object|Object[]} files - A single file object or an array of file objects from Multer
 * @returns {Promise<string|string[]>} - A single URL string or an array of URL strings
 */

/**
 * Compress image before S3 upload
 * @param {Buffer} buffer - Original image buffer
 * @param {string} mimetype - image/jpeg | image/png | image/webp
 * @returns {Buffer} compressed buffer
 */
const compressImage = async (buffer, mimetype) => {
  let image = sharp(buffer).rotate(); // auto-orient

  // Resize if large (optional but recommended)
  image = image.resize({
    width: 1200,
    withoutEnlargement: true,
  });

  // Compress based on type
  if (mimetype === "image/png") {
    return await image
      .png({
        compressionLevel: 9,
        quality: 80,
      })
      .toBuffer();
  }

  if (mimetype === "image/webp") {
    return await image
      .webp({
        quality: 80,
      })
      .toBuffer();
  }

  // Default → JPEG
  return await image
    .jpeg({
      quality: 80,
      mozjpeg: true,
    })
    .toBuffer();
};

const uploadToS3 = async (files) => {
  if (!BUCKET_NAME) {
    throw new Error("AWS_BUCKET_NAME environment variable is not set");
  }

  if (!region) {
    throw new Error("AWS region is not set");
  }

  const uploadSingle = async (file) => {
    let buffer;
    let mimetype = "application/octet-stream";
    let originalName = "file";

    // =========================
    // 1️⃣ Resolve file source
    // =========================

    // CASE: relative file path string
    if (typeof file === "string") {
      const absolutePath = path.join(process.cwd(), file);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File does not exist: ${absolutePath}`);
      }

      buffer = fs.readFileSync(absolutePath);
      originalName = path.basename(absolutePath);
    }

    // CASE: multer.memoryStorage
    else if (file?.buffer) {
      buffer = file.buffer;
      mimetype = file.mimetype;
      originalName = file.originalname || originalName;
    }

    // CASE: multer.diskStorage
    else if (file?.path) {
      buffer = fs.readFileSync(file.path);
      mimetype = file.mimetype;
      originalName = file.originalname || path.basename(file.path);
    } else {
      throw new Error("Invalid file input");
    }

    // =========================
    // 2️⃣ Compress if image
    // =========================
    let uploadBuffer = buffer;

    if (mimetype?.startsWith("image/")) {
      uploadBuffer = await compressImage(buffer, mimetype);
    }

    // =========================
    // 3️⃣ Upload to S3
    // =========================
    const key = `uploads/${Date.now()}_${originalName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: uploadBuffer,
        ContentType: mimetype,
      })
    );

    return key;
  };

  try {
    return Array.isArray(files)
      ? await Promise.all(files.map(uploadSingle))
      : await uploadSingle(files);
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};


const getS3FileUrl = (key) => {
  return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
};

module.exports = {
  s3,
  uploadToS3,
  getS3FileUrl,
  BUCKET_NAME,
};
