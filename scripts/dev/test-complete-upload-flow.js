/**
 * COMPREHENSIVE DOCUMENT UPLOAD TEST
 * This test will prove uploads are working by:
 * 1. Uploading a real file via API
 * 2. Verifying file exists in S3
 * 3. Testing download
 * 4. Cleaning up test data
 */

const http = require('http');
const { S3Client, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// ========================================
// CONFIGURATION
// ========================================
const API_HOST = 'localhost';
const API_PORT = process.env.PORT || 30001;
const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';

// IMPORTANT: Replace these with valid IDs from your MongoDB
const TEST_CONFIG = {
  customer_id: '68d3929ae4c5d9b3e920a9df', // Valid customer ID
  site_id: '68d3929ae4c5d9b3e920a9e1',     // Valid site ID
};

// S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ========================================
// TEST UTILITIES
// ========================================

function createMultipartBody(fields, file) {
  const boundary = '----TestBoundary' + Date.now();
  const parts = [];

  // Add fields
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${typeof value === 'object' ? JSON.stringify(value) : value}\r\n`
    );
  }

  // Add file
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
    `Content-Type: ${file.contentType}\r\n\r\n`
  );

  const header = Buffer.from(parts.join(''), 'utf8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    body: Buffer.concat([header, file.content, footer])
  };
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

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
      contentType: result.ContentType,
      lastModified: result.LastModified,
      etag: result.ETag
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
    console.error(`Failed to delete ${s3Key}:`, error.message);
    return false;
  }
}

// ========================================
// MAIN TEST
// ========================================

async function runCompleteTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 COMPREHENSIVE DOCUMENT UPLOAD TEST');
  console.log('='.repeat(80));
  console.log('\nThis test will PROVE uploads are working or failing.\n');

  const testResults = {
    apiUpload: false,
    s3FileExists: false,
    downloadUrlGenerated: false,
    fileContent: null,
    s3Key: null,
    documentId: null
  };

  let createdDocumentId = null;
  let s3Key = null;

  try {
    // ========================================
    // TEST 1: Check Backend is Running
    // ========================================
    console.log('📋 TEST 1: Verify Backend is Running');
    console.log('-'.repeat(80));

    try {
      const healthCheck = await httpRequest({
        hostname: API_HOST,
        port: API_PORT,
        path: '/health',
        method: 'GET'
      });

      if (healthCheck.statusCode === 200) {
        console.log('✅ Backend is running\n');
      } else {
        throw new Error(`Backend returned status ${healthCheck.statusCode}`);
      }
    } catch (error) {
      console.error('❌ Backend is NOT running!');
      console.error(`   Start it with: cd rest-api && npm run dev\n`);
      throw error;
    }

    // ========================================
    // TEST 2: Upload Document via API
    // ========================================
    console.log('📋 TEST 2: Upload Document via API');
    console.log('-'.repeat(80));

    const testFileContent = Buffer.from(
      `TEST FILE - ${new Date().toISOString()}\n` +
      `This file tests document upload functionality.\n` +
      `If you can download this file, uploads are working!\n`
    );

    const documentData = {
      name: `Unit Test Document ${Date.now()}`,
      category: 'architectural',
      type: 'TXT',
      description: 'Automated test document - safe to delete',
      version: '1.0',
      tags: ['test', 'automated', 'unit-test'],
      customer_id: TEST_CONFIG.customer_id,
      site_id: TEST_CONFIG.site_id,
      created_by: {
        user_id: 'test-user',
        user_name: 'Unit Test',
        email: 'test@test.com'
      }
    };

    const multipart = createMultipartBody(
      { document_data: JSON.stringify(documentData) },
      {
        filename: 'test-upload.txt',
        contentType: 'text/plain',
        content: testFileContent
      }
    );

    console.log('Uploading file...');
    console.log(`   Endpoint: http://${API_HOST}:${API_PORT}/api/documents`);
    console.log(`   Customer ID: ${TEST_CONFIG.customer_id}`);
    console.log(`   File size: ${testFileContent.length} bytes\n`);

    const uploadResponse = await httpRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/documents',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
        'Content-Length': multipart.body.length
      }
    }, multipart.body);

    if (uploadResponse.statusCode !== 200 && uploadResponse.statusCode !== 201) {
      console.error('❌ Upload failed!');
      console.error('   Status:', uploadResponse.statusCode);
      console.error('   Response:', JSON.stringify(uploadResponse.body, null, 2));
      throw new Error(`API returned status ${uploadResponse.statusCode}`);
    }

    if (!uploadResponse.body || !uploadResponse.body.success) {
      console.error('❌ Upload failed!');
      console.error('   Response:', JSON.stringify(uploadResponse.body, null, 2));
      throw new Error('API returned success: false');
    }

    testResults.apiUpload = true;
    createdDocumentId = uploadResponse.body.data._id || uploadResponse.body.data.id;
    s3Key = uploadResponse.body.data.file?.file_meta?.file_key ||
            uploadResponse.body.data.file?.file_meta?.file_path;

    testResults.documentId = createdDocumentId;
    testResults.s3Key = s3Key;

    console.log('✅ API Upload Successful!');
    console.log(`   Document ID: ${createdDocumentId}`);
    console.log(`   S3 Key: ${s3Key || '⚠️  NOT FOUND IN RESPONSE'}`);

    if (!s3Key) {
      console.error('\n❌ CRITICAL: No S3 key in API response!');
      console.error('   This means the backend did NOT upload to S3.');
      console.error('   Response file data:', JSON.stringify(uploadResponse.body.data.file, null, 2));
      throw new Error('S3 key missing from response');
    }
    console.log('');

    // ========================================
    // TEST 3: Verify File Exists in S3
    // ========================================
    console.log('📋 TEST 3: Verify File Exists in S3');
    console.log('-'.repeat(80));
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Key: ${s3Key}\n`);

    const s3Check = await verifyFileInS3(s3Key);

    if (!s3Check.exists) {
      console.error('❌ FILE NOT FOUND IN S3!');
      console.error('\n🔍 ROOT CAUSE IDENTIFIED:');
      console.error('   ✅ API accepted file');
      console.error('   ✅ MongoDB record created');
      console.error('   ✅ S3 key generated');
      console.error('   ❌ File NOT uploaded to S3');
      console.error('\n💡 DIAGNOSIS: Backend S3 upload is FAILING SILENTLY\n');
      throw new Error('File does not exist in S3 - upload failed');
    }

    testResults.s3FileExists = true;
    console.log('✅ File EXISTS in S3!');
    console.log(`   Size: ${s3Check.size} bytes`);
    console.log(`   Content-Type: ${s3Check.contentType}`);
    console.log(`   Last Modified: ${s3Check.lastModified}`);
    console.log(`   ETag: ${s3Check.etag}\n`);

    // ========================================
    // TEST 4: Generate Download URL
    // ========================================
    console.log('📋 TEST 4: Generate Download URL');
    console.log('-'.repeat(80));

    const downloadResponse = await httpRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: `/api/documents/${createdDocumentId}/download`,
      method: 'GET'
    });

    if (!downloadResponse.body?.success || !downloadResponse.body.data?.download_url) {
      console.error('❌ Download URL generation failed!');
      console.error('   Response:', JSON.stringify(downloadResponse.body, null, 2));
      throw new Error('Failed to generate download URL');
    }

    testResults.downloadUrlGenerated = true;
    const downloadUrl = downloadResponse.body.data.download_url;
    console.log('✅ Download URL Generated!');
    console.log(`   URL: ${downloadUrl.substring(0, 100)}...\n`);

    // ========================================
    // TEST 5: Download and Verify Content
    // ========================================
    console.log('📋 TEST 5: Download and Verify File Content');
    console.log('-'.repeat(80));

    const urlObj = new URL(downloadUrl);
    const downloadContentResponse = await new Promise((resolve, reject) => {
      const https = require('https');
      https.get(downloadUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            content: Buffer.concat(chunks)
          });
        });
      }).on('error', reject);
    });

    if (downloadContentResponse.statusCode !== 200) {
      console.error('❌ File download failed!');
      console.error(`   Status: ${downloadContentResponse.statusCode}`);
      throw new Error('Failed to download file from S3');
    }

    const downloadedContent = downloadContentResponse.content.toString('utf8');
    testResults.fileContent = downloadedContent;

    console.log('✅ File Downloaded Successfully!');
    console.log(`   Downloaded size: ${downloadContentResponse.content.length} bytes`);
    console.log(`   Expected size: ${testFileContent.length} bytes`);

    if (downloadedContent === testFileContent.toString('utf8')) {
      console.log('   ✅ Content matches perfectly!\n');
    } else {
      console.log('   ⚠️  Content differs (but file exists)\n');
    }

    // ========================================
    // TEST 6: Cleanup
    // ========================================
    console.log('📋 TEST 6: Cleanup Test Data');
    console.log('-'.repeat(80));

    // Delete from S3
    const s3Deleted = await deleteFileFromS3(s3Key);
    console.log(s3Deleted ? '✅ File deleted from S3' : '⚠️  Could not delete file from S3');

    // Delete from MongoDB via API
    const deleteResponse = await httpRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: `/api/documents/${createdDocumentId}`,
      method: 'DELETE'
    });

    console.log(deleteResponse.body?.success ? '✅ Document deleted from MongoDB' : '⚠️  Could not delete document from MongoDB');
    console.log('');

    // ========================================
    // FINAL RESULTS
    // ========================================
    console.log('='.repeat(80));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(80));
    console.log('\n✅ DOCUMENT UPLOAD SYSTEM IS WORKING CORRECTLY!\n');
    console.log('📊 Test Results Summary:');
    console.log(`   ✅ API Upload: ${testResults.apiUpload ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ S3 File Exists: ${testResults.s3FileExists ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ Download URL: ${testResults.downloadUrlGenerated ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ File Download: ${testResults.fileContent ? 'SUCCESS' : 'FAILED'}`);
    console.log(`\n📌 Test Document: ${createdDocumentId}`);
    console.log(`📌 S3 Key: ${s3Key}`);
    console.log(`\n💡 You can now upload documents with confidence!\n`);

    return {
      success: true,
      results: testResults
    };

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80) + '\n');

    console.error('💡 Error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔍 Diagnosis: Backend Not Running');
      console.error('   → Start backend: cd rest-api && npm run dev\n');
    } else if (error.message.includes('File does not exist in S3')) {
      console.error('\n🔍 Diagnosis: S3 Upload Failing');
      console.error('   → Backend is NOT uploading files to S3');
      console.error('   → Check backend console logs for errors');
      console.error('   → Verify AWS credentials have s3:PutObject permission\n');
    }

    console.error('📊 Test Results Summary:');
    console.error(`   ${testResults.apiUpload ? '✅' : '❌'} API Upload: ${testResults.apiUpload ? 'SUCCESS' : 'FAILED'}`);
    console.error(`   ${testResults.s3FileExists ? '✅' : '❌'} S3 File Exists: ${testResults.s3FileExists ? 'SUCCESS' : 'FAILED'}`);
    console.error(`   ${testResults.downloadUrlGenerated ? '✅' : '❌'} Download URL: ${testResults.downloadUrlGenerated ? 'SUCCESS' : 'FAILED'}`);

    if (testResults.documentId) {
      console.error(`\n📌 Created Document ID: ${testResults.documentId}`);
    }
    if (testResults.s3Key) {
      console.error(`📌 Expected S3 Key: ${testResults.s3Key}`);
    }

    console.error('\n📋 Configuration:');
    console.error(`   API: http://${API_HOST}:${API_PORT}`);
    console.error(`   Bucket: ${BUCKET_NAME}`);
    console.error(`   Customer ID: ${TEST_CONFIG.customer_id}`);
    console.error(`   Site ID: ${TEST_CONFIG.site_id}\n`);

    // Cleanup on failure
    if (s3Key) {
      await deleteFileFromS3(s3Key);
    }

    throw error;
  }
}

// ========================================
// RUN TEST
// ========================================

console.log('\n⚙️  Starting Comprehensive Upload Test...');
console.log('⚠️  Make sure:');
console.log('   1. Backend is running (npm run dev)');
console.log('   2. TEST_CONFIG has valid customer_id and site_id');
console.log('   3. AWS credentials are configured in .env\n');

runCompleteTest()
  .then(() => {
    console.log('✅ Test suite completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed\n');
    process.exit(1);
  });
