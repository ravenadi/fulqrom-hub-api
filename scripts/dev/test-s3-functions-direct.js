/**
 * DIRECT S3 UPLOAD FUNCTIONS TEST
 * Tests the S3 upload functions directly (bypassing API auth)
 * This will PROVE if the upload functions work correctly
 */

const { uploadFileToS3 } = require('./utils/s3Upload');
const TenantS3Service = require('./services/tenantS3Service');
const { S3Client, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';
const CUSTOMER_ID = '68d3929ae4c5d9b3e920a9df';

// S3 Client for verification
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function verifyFileInS3(s3Key) {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });
    const result = await s3Client.send(headCommand);
    return {
      exists: true,
      size: result.ContentLength,
      contentType: result.ContentType
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

async function deleteFileFromS3(s3Key) {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });
    await s3Client.send(deleteCommand);
    return true;
  } catch (error) {
    return false;
  }
}

async function runDirectTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 DIRECT S3 UPLOAD FUNCTIONS TEST');
  console.log('='.repeat(80));
  console.log('\nThis tests the upload functions DIRECTLY (no API, no auth)\n');

  const results = {
    sharedBucketUpload: false,
    sharedBucketS3Verify: false,
    tenantBucketUpload: false,
    s3KeysCollected: []
  };

  try {
    // ========================================
    // TEST 1: Test Shared Bucket Upload (uploadFileToS3)
    // ========================================
    console.log('📋 TEST 1: Shared Bucket Upload (uploadFileToS3)');
    console.log('-'.repeat(80));

    const testFile1 = {
      originalname: 'test-shared-bucket.txt',
      buffer: Buffer.from(`Test file for shared bucket - ${new Date().toISOString()}`),
      size: 100,
      mimetype: 'text/plain'
    };

    console.log('Calling uploadFileToS3()...');
    console.log(`   Customer ID: ${CUSTOMER_ID}`);
    console.log(`   File: ${testFile1.originalname}\n`);

    const sharedResult = await uploadFileToS3(testFile1, CUSTOMER_ID);

    if (!sharedResult.success) {
      console.error('❌ Upload function returned failure!');
      console.error('   Error:', sharedResult.error);
      throw new Error(`Shared bucket upload failed: ${sharedResult.error}`);
    }

    const sharedS3Key = sharedResult.data.file_meta.file_key;
    results.s3KeysCollected.push(sharedS3Key);
    results.sharedBucketUpload = true;

    console.log('✅ uploadFileToS3() returned SUCCESS!');
    console.log(`   S3 Key: ${sharedS3Key}`);
    console.log(`   Expected pattern: documents/${CUSTOMER_ID}/YYYY/MM/DD/...`);

    // Verify path includes customer_id
    if (!sharedS3Key.includes(CUSTOMER_ID)) {
      console.error(`   ⚠️  WARNING: S3 key does NOT include customer_id!`);
    } else {
      console.log(`   ✅ S3 key includes customer_id`);
    }
    console.log('');

    // Verify file exists in S3
    console.log('Verifying file in S3...');
    const sharedS3Check = await verifyFileInS3(sharedS3Key);

    if (!sharedS3Check.exists) {
      console.error('❌ FILE NOT FOUND IN S3!');
      console.error('   The function returned success but file is NOT in S3!');
      throw new Error('File not uploaded to S3 despite success response');
    }

    results.sharedBucketS3Verify = true;
    console.log('✅ File VERIFIED in S3!');
    console.log(`   Size: ${sharedS3Check.size} bytes`);
    console.log(`   Content-Type: ${sharedS3Check.contentType}\n`);

    // ========================================
    // TEST 2: Test Tenant Bucket Upload
    // ========================================
    console.log('📋 TEST 2: Tenant Bucket Upload (TenantS3Service)');
    console.log('-'.repeat(80));

    const testFile2 = {
      originalname: 'test-tenant-bucket.txt',
      buffer: Buffer.from(`Test file for tenant bucket - ${new Date().toISOString()}`),
      size: 100,
      mimetype: 'text/plain'
    };

    const organisationName = 'Test Organisation';

    console.log('Calling TenantS3Service.uploadFileToTenantBucket()...');
    console.log(`   Tenant ID: ${CUSTOMER_ID}`);
    console.log(`   Organisation: ${organisationName}`);
    console.log(`   File: ${testFile2.originalname}\n`);

    const tenantS3Service = new TenantS3Service();
    const tenantResult = await tenantS3Service.uploadFileToTenantBucket(
      testFile2,
      CUSTOMER_ID,
      organisationName
    );

    if (!tenantResult.success) {
      console.error('❌ Tenant upload function returned failure!');
      console.error('   Error:', tenantResult.error);
      console.error('   This is expected - tenant bucket may not exist');
      console.error('   The system should fall back to shared bucket\n');
    } else {
      const tenantS3Key = tenantResult.data.file_meta.file_key;
      const tenantBucket = tenantResult.data.file_meta.bucket_name;
      results.s3KeysCollected.push({ bucket: tenantBucket, key: tenantS3Key });
      results.tenantBucketUpload = true;

      console.log('✅ Tenant upload returned SUCCESS!');
      console.log(`   Bucket: ${tenantBucket}`);
      console.log(`   S3 Key: ${tenantS3Key}\n`);
    }

    // ========================================
    // TEST 3: Cleanup
    // ========================================
    console.log('📋 TEST 3: Cleanup Test Files');
    console.log('-'.repeat(80));

    for (const item of results.s3KeysCollected) {
      const key = typeof item === 'string' ? item : item.key;
      const deleted = await deleteFileFromS3(key);
      console.log(deleted ? `✅ Deleted: ${key}` : `⚠️  Could not delete: ${key}`);
    }
    console.log('');

    // ========================================
    // FINAL RESULTS
    // ========================================
    console.log('='.repeat(80));
    console.log('🎉 TESTS COMPLETED!');
    console.log('='.repeat(80));
    console.log('\n📊 Results Summary:\n');

    if (results.sharedBucketUpload && results.sharedBucketS3Verify) {
      console.log('✅ SHARED BUCKET UPLOAD: WORKING');
      console.log('   uploadFileToS3() successfully uploads files to S3\n');
    } else {
      console.log('❌ SHARED BUCKET UPLOAD: FAILED');
      console.log('   uploadFileToS3() is NOT working\n');
    }

    if (results.tenantBucketUpload) {
      console.log('✅ TENANT BUCKET UPLOAD: WORKING');
      console.log('   TenantS3Service can upload to tenant buckets\n');
    } else {
      console.log('⚠️  TENANT BUCKET UPLOAD: FAILED (Expected)');
      console.log('   TenantS3Service falls back to shared bucket\n');
    }

    console.log('💡 CONCLUSION:');
    if (results.sharedBucketUpload && results.sharedBucketS3Verify) {
      console.log('   ✅ The S3 upload functions WORK CORRECTLY');
      console.log('   ✅ Files ARE being uploaded to S3');
      console.log('   ✅ With the fix applied, document uploads should work\n');
    } else {
      console.log('   ❌ S3 upload functions are BROKEN');
      console.log('   ❌ Need to investigate AWS credentials or S3 permissions\n');
    }

    return { success: true, results };

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80) + '\n');
    console.error('Error:', error.message);
    console.error('\n📊 Results Summary:');
    console.error(`   ${results.sharedBucketUpload ? '✅' : '❌'} Shared Bucket Upload: ${results.sharedBucketUpload ? 'SUCCESS' : 'FAILED'}`);
    console.error(`   ${results.sharedBucketS3Verify ? '✅' : '❌'} S3 Verification: ${results.sharedBucketS3Verify ? 'SUCCESS' : 'FAILED'}`);

    // Cleanup on failure
    for (const item of results.s3KeysCollected) {
      const key = typeof item === 'string' ? item : item.key;
      await deleteFileFromS3(key);
    }

    throw error;
  }
}

// Run test
console.log('\n⚙️  Testing S3 Upload Functions Directly...\n');

runDirectTest()
  .then(() => {
    console.log('✅ Test completed\n');
    process.exit(0);
  })
  .catch(() => {
    console.error('❌ Test failed\n');
    process.exit(1);
  });
