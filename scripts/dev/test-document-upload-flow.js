/**
 * Complete Document Upload Flow Test
 * Tests the entire flow: Upload → S3 Storage → Download URL Generation
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:30001';
const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';

// Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Test data - Replace these with valid IDs from your database
const TEST_DATA = {
  customer_id: '68d3929ae4c5d9b3e920a9df', // Replace with a valid customer ID
  site_id: '68d3929ae4c5d9b3e920a9e1',    // Replace with a valid site ID
  // Get auth token if your API requires it
  // auth_token: 'your-auth-token-here'
};

async function createTestFile() {
  const testFilePath = path.join(__dirname, 'test-upload-file.txt');
  const testContent = `Test document upload - ${new Date().toISOString()}\n\nThis file was created to test document upload flow.`;
  fs.writeFileSync(testFilePath, testContent);
  console.log('✅ Test file created:', testFilePath);
  return testFilePath;
}

async function testDocumentUploadFlow() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 COMPLETE DOCUMENT UPLOAD FLOW TEST');
  console.log('='.repeat(70) + '\n');

  let createdDocumentId = null;
  let s3Key = null;

  try {
    // Step 1: Create test file
    console.log('📋 Step 1: Creating Test File');
    console.log('-'.repeat(70));
    const testFilePath = await createTestFile();
    console.log('✅ Test file ready\n');

    // Step 2: Upload document via API
    console.log('📋 Step 2: Uploading Document via API');
    console.log('-'.repeat(70));
    console.log(`API Endpoint: POST ${API_BASE_URL}/api/documents`);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));

    const documentData = {
      name: 'Test Upload Document',
      category: 'architectural',
      type: 'PDF',
      description: 'Test document created by automated test',
      version: '1.0',
      tags: ['test', 'automated'],
      customer_id: TEST_DATA.customer_id,
      site_id: TEST_DATA.site_id,
      created_by: {
        user_id: 'test-user',
        user_name: 'Test User',
        email: 'test@example.com'
      }
    };

    formData.append('document_data', JSON.stringify(documentData));

    const uploadResponse = await axios.post(
      `${API_BASE_URL}/api/documents`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          // Add auth header if needed
          // 'Authorization': `Bearer ${TEST_DATA.auth_token}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    if (uploadResponse.data.success) {
      console.log('✅ Document uploaded successfully!');
      createdDocumentId = uploadResponse.data.data._id || uploadResponse.data.data.id;
      s3Key = uploadResponse.data.data.file?.file_meta?.file_key ||
              uploadResponse.data.data.file?.file_meta?.file_path;

      console.log('   Document ID:', createdDocumentId);
      console.log('   S3 Key:', s3Key);
      console.log('   File URL:', uploadResponse.data.data.file?.file_meta?.file_url);
    } else {
      throw new Error('Upload response indicates failure: ' + JSON.stringify(uploadResponse.data));
    }

    if (!s3Key) {
      throw new Error('❌ CRITICAL: No S3 key found in response! File was NOT uploaded to S3.');
    }
    console.log('');

    // Step 3: Verify file exists in S3
    console.log('📋 Step 3: Verifying File in S3');
    console.log('-'.repeat(70));
    console.log(`Checking S3 bucket: ${BUCKET_NAME}`);
    console.log(`Looking for key: ${s3Key}`);

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });
      const headResult = await s3Client.send(headCommand);

      console.log('✅ File verified in S3!');
      console.log('   Content-Type:', headResult.ContentType);
      console.log('   Content-Length:', headResult.ContentLength, 'bytes');
      console.log('   Last Modified:', headResult.LastModified);
      console.log('   ETag:', headResult.ETag);
    } catch (s3Error) {
      if (s3Error.name === 'NotFound' || s3Error.$metadata?.httpStatusCode === 404) {
        throw new Error(`❌ CRITICAL ERROR: File NOT FOUND in S3!\n\n` +
          `The document was created in MongoDB but the file was NOT uploaded to S3.\n` +
          `S3 Key: ${s3Key}\n\n` +
          `This confirms the upload is failing silently.`);
      }
      throw s3Error;
    }
    console.log('');

    // Step 4: Get download URL
    console.log('📋 Step 4: Testing Download URL Generation');
    console.log('-'.repeat(70));

    const downloadResponse = await axios.get(
      `${API_BASE_URL}/api/documents/${createdDocumentId}/download`,
      {
        headers: {
          // Add auth header if needed
          // 'Authorization': `Bearer ${TEST_DATA.auth_token}`
        }
      }
    );

    if (downloadResponse.data.success && downloadResponse.data.data?.download_url) {
      console.log('✅ Download URL generated successfully!');
      console.log('   URL:', downloadResponse.data.data.download_url.substring(0, 100) + '...');

      // Step 5: Test downloading the file
      console.log('\n📋 Step 5: Testing File Download');
      console.log('-'.repeat(70));

      const fileResponse = await axios.get(downloadResponse.data.data.download_url, {
        responseType: 'arraybuffer'
      });

      if (fileResponse.status === 200) {
        console.log('✅ File downloaded successfully!');
        console.log('   Status:', fileResponse.status);
        console.log('   Content-Type:', fileResponse.headers['content-type']);
        console.log('   File size:', fileResponse.data.length, 'bytes');
      } else {
        throw new Error(`Download failed with status: ${fileResponse.status}`);
      }
    } else {
      throw new Error('Failed to generate download URL: ' + JSON.stringify(downloadResponse.data));
    }

    // Cleanup test file
    fs.unlinkSync(testFilePath);
    console.log('\n✅ Test file cleaned up');

    // Success summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n✨ Document upload flow is working correctly!');
    console.log('\n📊 Summary:');
    console.log(`   ✅ API accepted file upload`);
    console.log(`   ✅ File uploaded to S3 bucket: ${BUCKET_NAME}`);
    console.log(`   ✅ File verified in S3 at key: ${s3Key}`);
    console.log(`   ✅ Download URL generated successfully`);
    console.log(`   ✅ File downloaded successfully`);
    console.log(`\n📌 Created Document ID: ${createdDocumentId}`);
    console.log(`📌 S3 Key: ${s3Key}\n`);

    return {
      success: true,
      documentId: createdDocumentId,
      s3Key: s3Key
    };

  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));

    if (error.response) {
      console.error('\n🔍 API Error Response:');
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 404) {
        console.error('\n💡 Diagnosis: API endpoint not found');
        console.error('   → Check if backend server is running on port 30001');
        console.error('   → Verify the API route is correctly configured');
      } else if (error.response.status === 400) {
        console.error('\n💡 Diagnosis: Bad Request');
        console.error('   → Check if customer_id and site_id are valid');
        console.error('   → Verify all required fields are provided');
      } else if (error.response.status === 401 || error.response.status === 403) {
        console.error('\n💡 Diagnosis: Authentication Error');
        console.error('   → Add valid auth token to TEST_DATA');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Diagnosis: Connection Refused');
      console.error('   → Backend server is not running');
      console.error('   → Run: cd rest-api && npm run dev');
    } else {
      console.error('\n💡 Error Details:');
      console.error('   Message:', error.message);
      if (error.stack) {
        console.error('\n   Stack:', error.stack);
      }
    }

    console.error('\n📋 Test Configuration:');
    console.error('   API_BASE_URL:', API_BASE_URL);
    console.error('   BUCKET_NAME:', BUCKET_NAME);
    console.error('   Customer ID:', TEST_DATA.customer_id);
    console.error('   Site ID:', TEST_DATA.site_id);
    console.error('');

    throw error;
  }
}

// Run the test
testDocumentUploadFlow()
  .then(result => {
    console.log('\n✅ Test completed successfully\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed\n');
    process.exit(1);
  });
