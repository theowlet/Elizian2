const { S3Client } = require("@aws-sdk/client-s3");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { crypto } = require("crypto");
const fs = require("fs");
const path = require("path");


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


const uploadToS3 = async (files) => {
  if (!BUCKET_NAME) {
    throw new Error("AWS_BUCKET_NAME environment variable is not set");
  }

  if (!region) {
    throw new Error("AWS region is not set");
  }

 const uploadSingle = async (file) => {
  let body;
  let originalName = "file";

  // ✅ CASE: file is a relative path string
  if (typeof file === "string") {
    const absolutePath = path.join(process.cwd(), file);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${absolutePath}`);
    }

    body = fs.createReadStream(absolutePath);
    originalName = path.basename(absolutePath);
  }

  // multer.memoryStorage
  else if (file?.buffer) {
    body = file.buffer;
    originalName = file.originalname || originalName;
  }

  // multer.diskStorage
  else if (file?.path) {
    body = fs.createReadStream(file.path);
    originalName = file.originalname || path.basename(file.path);
  }

  else {
    throw new Error("Invalid file input");
  }

  const key = `uploads/${Date.now()}_${originalName}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: "application/octet-stream",
  }));

  return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
};


  try {
    return Array.isArray(files)
      ? Promise.all(files.map(uploadSingle))
      : uploadSingle(files);
  } catch (error) {
    console.error("S3 Upload Error:", error.message);
    throw error;
  }
};

const getS3FileUrl = (key) => {
  return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com${key}`;
};

module.exports = {
  s3,
  uploadToS3,
  getS3FileUrl,
  BUCKET_NAME,
};
