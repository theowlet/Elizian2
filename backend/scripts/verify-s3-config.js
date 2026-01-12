/**
 * Verify AWS S3 Configuration
 * Checks if S3 credentials are properly configured for QR code storage
 */

require('dotenv').config();
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { log, logError } = require('../utils/logger');

async function verifyS3Config() {
  console.log('🔍 Verifying AWS S3 Configuration...\n');

  // Check required environment variables
  const requiredVars = {
    'AWS_BUCKET_NAME': process.env.AWS_BUCKET_NAME,
    'AWS_REGION': process.env.AWS_REGION || 'us-east-1',
    'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
    'AWS_SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY
  };

  console.log('📋 Environment Variables Check:');
  let allPresent = true;
  
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      if (key.includes('SECRET') || key.includes('KEY')) {
        console.log(`   ✅ ${key}: ${'*'.repeat(10)} (hidden)`);
      } else {
        console.log(`   ✅ ${key}: ${value}`);
      }
    } else {
      console.log(`   ❌ ${key}: NOT SET`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.log('\n❌ Missing required environment variables!');
    console.log('\n📝 Please add these to your .env file:');
    console.log('   AWS_BUCKET_NAME=your-bucket-name');
    console.log('   AWS_REGION=us-east-1');
    console.log('   AWS_ACCESS_KEY_ID=your-access-key');
    console.log('   AWS_SECRET_ACCESS_KEY=your-secret-key');
    process.exit(1);
  }

  // Test S3 connection
  console.log('\n🔌 Testing S3 Connection...');
  try {
    const s3Client = new S3Client({
      region: requiredVars.AWS_REGION,
      credentials: {
        accessKeyId: requiredVars.AWS_ACCESS_KEY_ID,
        secretAccessKey: requiredVars.AWS_SECRET_ACCESS_KEY
      }
    });

    // Try to list buckets (tests credentials)
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    console.log('   ✅ S3 connection successful!');
    console.log(`   📦 Accessible buckets: ${response.Buckets?.length || 0}`);

    // Check if specified bucket exists
    const bucketName = requiredVars.AWS_BUCKET_NAME;
    const bucketExists = response.Buckets?.some(b => b.Name === bucketName);
    
    if (bucketExists) {
      console.log(`   ✅ Bucket "${bucketName}" exists and is accessible`);
    } else {
      console.log(`   ⚠️  Bucket "${bucketName}" not found in accessible buckets`);
      console.log(`   💡 Make sure the bucket exists and your credentials have access`);
    }

    console.log('\n✅ S3 Configuration Verified!');
    console.log('   QR codes can be uploaded to S3 successfully.');
    return true;

  } catch (error) {
    console.log('\n❌ S3 Connection Failed!');
    console.log(`   Error: ${error.message}`);
    
    if (error.name === 'InvalidAccessKeyId') {
      console.log('   💡 Check your AWS_ACCESS_KEY_ID');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.log('   💡 Check your AWS_SECRET_ACCESS_KEY');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('   💡 Check your AWS_REGION and network connection');
    }
    
    process.exit(1);
  }
}

verifyS3Config()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError('Verification failed:', error);
    process.exit(1);
  });

