const { S3Client } = require("@aws-sdk/client-s3");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

// Get bucket name from environment
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Initialize the S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
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

  // Helper function for the actual S3 upload logic
  const uploadSingle = async (file) => {
    if (!file || !file.buffer) {
      throw new Error("Invalid file object: missing buffer");
    }

    const fileName = `uploads/${Date.now()}_${(file.originalname || 'image').replace(/\s+/g, '-')}`;
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype || 'image/jpeg',
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);
    
    // Return the public URL based on your AWS region
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${fileName}`;
  };

  try {
    // Check if input is an array (multiple images)
    if (Array.isArray(files)) {
      return await Promise.all(files.map(file => uploadSingle(file)));
    }
    
    // Otherwise, handle as a single image
    return await uploadSingle(files);
    
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};

module.exports = {
  s3,
  uploadToS3,
  BUCKET_NAME,
};
