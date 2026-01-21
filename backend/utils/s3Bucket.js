import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// Initialize the S3 Client
export const s3 = new S3Client({
  region: process.env.AWS_REGION,
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
export const uploadToS3 = async (files) => {
  // Helper function for the actual S3 upload logic
  const uploadSingle = async (file) => {
    const fileName = `uploads/${Date.now()}_${file.originalname.replace(/\s+/g, '-')}`;
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);
    
    // Return the public URL based on your us-east-1 region
    return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
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

export const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
