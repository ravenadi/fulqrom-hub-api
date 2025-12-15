/**
 * S3 Upload Test Script
 * Tests direct upload to S3 to verify AWS credentials and connectivity
 */

const { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';

async function runS3Tests() {
  console.log('🧪 Starting S3 Upload Tests...\n');
  console.log('='.repeat(60));

  // Test 1: Check AWS credentials
  console.log('\n📋 Test 1: AWS Credentials Check');
  console.log('-'.repeat(60));
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...` : '❌ NOT SET');
  console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ SET (hidden)' : '❌ NOT SET');
  console.log('AWS_DEFAULT_REGION:', process.env.AWS_DEFAULT_REGION || '❌ NOT SET');
  console.log('AWS_BUCKET:', BUCKET_NAME);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('\n❌ ERROR: AWS credentials not found in environment variables');
    process.exit(1);
  }

  // Test 2: Check bucket access
  console.log('\n📋 Test 2: S3 Bucket Access Check');
  console.log('-'.repeat(60));
  try {
    const headBucketCommand = new HeadBucketCommand({
      Bucket: BUCKET_NAME
    });
    await s3Client.send(headBucketCommand);
    console.log(`✅ SUCCESS: Can access bucket '${BUCKET_NAME}'`);
  } catch (error) {
    console.error(`❌ ERROR: Cannot access bucket '${BUCKET_NAME}'`);
    console.error('Error:', error.message);
    if (error.name === 'NotFound') {
      console.error('→ Bucket does not exist');
    } else if (error.name === 'Forbidden') {
      console.error('→ Access denied - check IAM permissions');
    }
    process.exit(1);
  }

  // Test 3: List recent files
  console.log('\n📋 Test 3: List Recent Files in Bucket');
  console.log('-'.repeat(60));
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'documents/',
      MaxKeys: 5
    });
    const listResult = await s3Client.send(listCommand);

    if (listResult.Contents && listResult.Contents.length > 0) {
      console.log(`✅ Found ${listResult.Contents.length} recent files:`);
      listResult.Contents.forEach(file => {
        console.log(`   - ${file.Key} (${file.Size} bytes, ${file.LastModified})`);
      });
    } else {
      console.log('⚠️  No files found in documents/ folder');
    }
  } catch (error) {
    console.error('❌ ERROR: Cannot list files');
    console.error('Error:', error.message);
  }

  // Test 4: Upload a test file
  console.log('\n📋 Test 4: Upload Test File');
  console.log('-'.repeat(60));

  const testFileName = `test-upload-${Date.now()}.txt`;
  const testFileContent = `This is a test file uploaded at ${new Date().toISOString()}`;
  const testS3Key = `documents/test/${testFileName}`;

  try {
    console.log(`Uploading test file: ${testS3Key}`);

    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testS3Key,
      Body: Buffer.from(testFileContent),
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'test': 'true',
        'upload-date': new Date().toISOString()
      }
    });

    const uploadResult = await s3Client.send(uploadCommand);
    console.log('✅ SUCCESS: File uploaded to S3!');
    console.log('   ETag:', uploadResult.ETag);
    console.log('   VersionId:', uploadResult.VersionId || 'N/A');
    console.log('   S3 Key:', testS3Key);

    // Test 5: Generate presigned URL
    console.log('\n📋 Test 5: Generate Presigned Download URL');
    console.log('-'.repeat(60));

    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testS3Key
    });

    const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });
    console.log('✅ SUCCESS: Presigned URL generated');
    console.log('   URL:', presignedUrl.substring(0, 100) + '...');
    console.log('   Expires in: 3600 seconds (1 hour)');

    console.log('\n📋 Test 6: Verify File in S3');
    console.log('-'.repeat(60));
    const verifyListCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: testS3Key
    });
    const verifyResult = await s3Client.send(verifyListCommand);

    if (verifyResult.Contents && verifyResult.Contents.length > 0) {
      console.log('✅ SUCCESS: File verified in S3');
      console.log(`   File: ${verifyResult.Contents[0].Key}`);
      console.log(`   Size: ${verifyResult.Contents[0].Size} bytes`);
      console.log(`   Last Modified: ${verifyResult.Contents[0].LastModified}`);
    } else {
      console.log('❌ WARNING: File not found in S3 after upload');
    }

  } catch (error) {
    console.error('❌ ERROR: File upload failed');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Code:', error.$metadata?.httpStatusCode);

    if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      console.error('\n🔍 Diagnosis: Access Denied');
      console.error('→ AWS credentials lack s3:PutObject permission');
      console.error('→ Check IAM policy for the credentials');
    } else if (error.name === 'InvalidAccessKeyId') {
      console.error('\n🔍 Diagnosis: Invalid Access Key');
      console.error('→ AWS Access Key ID may have been rotated or deleted');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('\n🔍 Diagnosis: Invalid Secret Key');
      console.error('→ AWS Secret Access Key is incorrect');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('\n🔍 Diagnosis: Network Issue');
      console.error('→ Cannot reach S3 endpoint');
      console.error('→ Check internet connection and firewall');
    }

    console.error('\nFull error:', error);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS PASSED!');
  console.log('='.repeat(60));
  console.log('\n✨ S3 upload is working correctly!');
  console.log('📌 Test file uploaded to: ' + testS3Key);
  console.log('\n💡 Next steps:');
  console.log('   1. Try uploading a document via the frontend');
  console.log('   2. Check backend console logs for detailed output');
  console.log('   3. If frontend upload fails, share the backend logs\n');
}

// Run tests
runS3Tests().catch(error => {
  console.error('\n❌ Test script failed:', error);
  process.exit(1);
});
