/**
 * Test script to verify tenant bucket access and presigned URL generation
 */

require('dotenv').config();
const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function testTenantBucketAccess() {
  try {
    console.log('🧪 Testing tenant bucket access...\n');

    // Test document from the database
    const bucketName = 'fulq-org-200-sgt-dev-68f9ec5c7af72cefe3bc79bd';
    const s3Key = 'documents/2025/10/23/1761211658386-5bbf0f8c-1884-4c5f-9e51-6c6d662e07dc-user-management.png';

    console.log('📦 Testing bucket:', bucketName);
    console.log('🔑 Testing key:', s3Key);
    console.log();

    // 1. Check if file exists
    console.log('1️⃣  Checking if file exists in tenant bucket...');
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      });
      const headResult = await s3Client.send(headCommand);
      console.log('   ✅ File exists!');
      console.log('   Content-Type:', headResult.ContentType);
      console.log('   Content-Length:', headResult.ContentLength, 'bytes');
      console.log('   Last-Modified:', headResult.LastModified);
      console.log();
    } catch (error) {
      console.log('   ❌ File does not exist or cannot be accessed');
      console.log('   Error:', error.message);
      console.log();
      return;
    }

    // 2. Generate presigned URL for download
    console.log('2️⃣  Generating presigned URL for download...');
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      });
      const downloadUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });
      console.log('   ✅ Download URL generated successfully!');
      console.log('   URL:', downloadUrl.substring(0, 100) + '...');
      console.log();
    } catch (error) {
      console.log('   ❌ Failed to generate download URL');
      console.log('   Error:', error.message);
      console.log();
    }

    // 3. Generate presigned URL for preview (inline)
    console.log('3️⃣  Generating presigned URL for preview (inline)...');
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        ResponseContentType: 'image/png',
        ResponseContentDisposition: 'inline'
      });
      const previewUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });
      console.log('   ✅ Preview URL generated successfully!');
      console.log('   URL:', previewUrl.substring(0, 100) + '...');
      console.log();
      console.log('📋 Full Preview URL (copy this to test in browser):');
      console.log(previewUrl);
      console.log();
    } catch (error) {
      console.log('   ❌ Failed to generate preview URL');
      console.log('   Error:', error.message);
      console.log();
    }

    console.log('✅ Test complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Copy the preview URL above and test it in a browser');
    console.log('   2. If it works, the issue is in the API endpoint logic');
    console.log('   3. If it doesn\'t work, there may be CORS or IAM permission issues');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testTenantBucketAccess();
