/**
 * Simple Document Upload Flow Test (No External Dependencies)
 * Tests: Upload → S3 Storage → Download
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Configuration
const API_PORT = process.env.PORT || 30001;
const API_HOST = 'localhost';
const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';

// Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// IMPORTANT: Update these with valid IDs from your database
const TEST_DATA = {
  customer_id: '68d3929ae4c5d9b3e920a9df', // Replace with valid customer ID
  site_id: '68d3929ae4c5d9b3e920a9e1',     // Replace with valid site ID
};

function createMultipartBody(fields, file) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [];

  // Add form fields
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

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 DOCUMENT UPLOAD FLOW TEST');
  console.log('='.repeat(70) + '\n');

  let createdDocumentId = null;
  let s3Key = null;

  try {
    // Step 1: Create test file
    console.log('📋 Step 1: Creating Test File');
    console.log('-'.repeat(70));
    const testContent = Buffer.from(`Test document - ${new Date().toISOString()}\nTesting upload flow.`);
    console.log('✅ Test content created (' + testContent.length + ' bytes)\n');

    // Step 2: Upload via API
    console.log('📋 Step 2: Uploading Document via API');
    console.log('-'.repeat(70));
    console.log(`Endpoint: POST http://${API_HOST}:${API_PORT}/api/documents`);

    const documentData = {
      name: 'Test Upload ' + Date.now(),
      category: 'architectural',
      type: 'TXT',
      description: 'Automated test document',
      version: '1.0',
      tags: ['test'],
      customer_id: TEST_DATA.customer_id,
      site_id: TEST_DATA.site_id,
      created_by: {
        user_id: 'test',
        user_name: 'Test User',
        email: 'test@test.com'
      }
    };

    const multipart = createMultipartBody(
      { document_data: JSON.stringify(documentData) },
      {
        filename: 'test-document.txt',
        contentType: 'text/plain',
        content: testContent
      }
    );

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
      throw new Error(`Upload failed with status ${uploadResponse.statusCode}: ${JSON.stringify(uploadResponse.body)}`);
    }

    if (!uploadResponse.body || !uploadResponse.body.success) {
      throw new Error('Upload response indicates failure: ' + JSON.stringify(uploadResponse.body));
    }

    console.log('✅ Document uploaded successfully!');
    createdDocumentId = uploadResponse.body.data._id || uploadResponse.body.data.id;
    s3Key = uploadResponse.body.data.file?.file_meta?.file_key ||
            uploadResponse.body.data.file?.file_meta?.file_path;

    console.log('   Document ID:', createdDocumentId);
    console.log('   S3 Key:', s3Key || '❌ NOT FOUND');

    if (!s3Key) {
      console.error('\n❌ CRITICAL: No S3 key in response!');
      console.error('Response data:', JSON.stringify(uploadResponse.body.data, null, 2));
      throw new Error('File was NOT uploaded to S3 - no S3 key in response');
    }
    console.log('');

    // Step 3: Verify in S3
    console.log('📋 Step 3: Verifying File in S3');
    console.log('-'.repeat(70));
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Key: ${s3Key}`);

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });
      const headResult = await s3Client.send(headCommand);

      console.log('✅ File FOUND in S3!');
      console.log('   Size:', headResult.ContentLength, 'bytes');
      console.log('   Type:', headResult.ContentType);
      console.log('   Last Modified:', headResult.LastModified);
    } catch (s3Error) {
      if (s3Error.name === 'NotFound' || s3Error.$metadata?.httpStatusCode === 404) {
        console.error('\n❌ CRITICAL ERROR: File NOT FOUND in S3!');
        console.error('\n🔍 Diagnosis:');
        console.error('   → MongoDB record created: ✅');
        console.error('   → S3 key generated: ✅');
        console.error('   → File uploaded to S3: ❌ FAILED');
        console.error('\n💡 This confirms S3 upload is failing silently!');
        console.error('   Backend is saving S3 paths WITHOUT uploading files.\n');
        throw new Error('S3 upload failure confirmed');
      }
      throw s3Error;
    }
    console.log('');

    // Step 4: Test download URL
    console.log('📋 Step 4: Testing Download URL');
    console.log('-'.repeat(70));

    const downloadResponse = await httpRequest({
      hostname: API_HOST,
      port: API_PORT,
      path: `/api/documents/${createdDocumentId}/download`,
      method: 'GET'
    });

    if (downloadResponse.body?.success && downloadResponse.body.data?.download_url) {
      console.log('✅ Download URL generated!');
      console.log('   URL:', downloadResponse.body.data.download_url.substring(0, 80) + '...');
    } else {
      throw new Error('Failed to generate download URL: ' + JSON.stringify(downloadResponse.body));
    }

    // Success!
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n✨ Document upload system is working correctly!\n');
    console.log('📊 Summary:');
    console.log(`   ✅ File uploaded via API`);
    console.log(`   ✅ MongoDB record created`);
    console.log(`   ✅ File exists in S3`);
    console.log(`   ✅ Download URL works`);
    console.log(`\n📌 Test Document ID: ${createdDocumentId}`);
    console.log(`📌 S3 Key: ${s3Key}\n`);

    return { success: true, documentId: createdDocumentId, s3Key };

  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70) + '\n');

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Diagnosis: Connection Refused');
      console.error(`   → Backend not running on http://${API_HOST}:${API_PORT}`);
      console.error('   → Start backend: cd rest-api && npm run dev\n');
    } else {
      console.error('💡 Error:', error.message);
      if (error.stack) {
        console.error('\nStack:', error.stack);
      }
    }

    console.error('\n📋 Configuration:');
    console.error(`   API: http://${API_HOST}:${API_PORT}`);
    console.error(`   Bucket: ${BUCKET_NAME}`);
    console.error(`   Customer ID: ${TEST_DATA.customer_id}`);
    console.error(`   Site ID: ${TEST_DATA.site_id}\n`);

    throw error;
  }
}

// Run test
console.log('\n⚙️  Starting Document Upload Flow Test...');
console.log('⚠️  NOTE: Make sure backend is running (npm run dev) and update TEST_DATA with valid IDs!\n');

runTest()
  .then(() => {
    console.log('✅ Test completed successfully\n');
    process.exit(0);
  })
  .catch(() => {
    console.error('❌ Test failed\n');
    process.exit(1);
  });
