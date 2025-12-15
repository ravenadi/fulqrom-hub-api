/**
 * Find Uploaded Files in S3
 * Search for specific files and show S3 bucket structure
 */

const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
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

// The S3 key from your error message
const SEARCH_KEY = 'documents/2025/10/21/1761044322200-b2630103-c785-4640-a5b8-e01bf1d6eb95-user-management.png';

async function findFileInS3() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 SEARCHING FOR FILE IN S3');
  console.log('='.repeat(80) + '\n');

  console.log('📋 Configuration:');
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Region: ${process.env.AWS_DEFAULT_REGION || 'ap-southeast-2'}`);
  console.log(`   Search Key: ${SEARCH_KEY}\n`);

  try {
    // Step 1: Check if specific file exists
    console.log('📋 Step 1: Checking Specific File');
    console.log('-'.repeat(80));
    console.log(`Looking for: ${SEARCH_KEY}\n`);

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: SEARCH_KEY
      });
      const headResult = await s3Client.send(headCommand);

      console.log('✅ FILE FOUND!');
      console.log('\n📊 File Details:');
      console.log(`   Key: ${SEARCH_KEY}`);
      console.log(`   Size: ${headResult.ContentLength} bytes (${(headResult.ContentLength / 1024).toFixed(2)} KB)`);
      console.log(`   Content-Type: ${headResult.ContentType}`);
      console.log(`   Last Modified: ${headResult.LastModified}`);
      console.log(`   ETag: ${headResult.ETag}`);
      console.log(`   Server Side Encryption: ${headResult.ServerSideEncryption || 'None'}`);
      if (headResult.VersionId) {
        console.log(`   Version ID: ${headResult.VersionId}`);
      }

      console.log('\n✅ The file EXISTS in S3!');
      console.log('💡 If download is still failing, it\'s a presigned URL generation issue.\n');

    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        console.log('❌ FILE NOT FOUND in S3!');
        console.log('\n🔍 This confirms: The file was NEVER uploaded to S3.\n');

        // Step 2: List recent uploads to see what's actually there
        console.log('📋 Step 2: Listing Recent Files in Bucket');
        console.log('-'.repeat(80));
        console.log('Checking what files were actually uploaded today...\n');

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayPrefix = `documents/${year}/${month}/${day}/`;

        console.log(`Searching in: ${todayPrefix}\n`);

        const listCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: todayPrefix,
          MaxKeys: 20
        });
        const listResult = await s3Client.send(listCommand);

        if (listResult.Contents && listResult.Contents.length > 0) {
          console.log(`✅ Found ${listResult.Contents.length} files uploaded today:\n`);
          listResult.Contents.forEach((file, index) => {
            console.log(`${index + 1}. ${file.Key}`);
            console.log(`   Size: ${file.Size} bytes`);
            console.log(`   Last Modified: ${file.LastModified}\n`);
          });

          console.log('💡 Your file is NOT in this list!');
          console.log('   This proves the upload to S3 is failing.\n');
        } else {
          console.log('❌ NO files found uploaded today!');
          console.log('\n💡 This proves S3 uploads are completely failing.\n');
        }

      } else {
        throw error;
      }
    }

    // Step 3: Show S3 bucket structure
    console.log('📋 Step 3: S3 Bucket Structure');
    console.log('-'.repeat(80));
    console.log('Showing recent documents folders...\n');

    const recentCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'documents/',
      Delimiter: '/',
      MaxKeys: 10
    });
    const recentResult = await s3Client.send(recentCommand);

    if (recentResult.CommonPrefixes && recentResult.CommonPrefixes.length > 0) {
      console.log('📁 Top-level folders in S3:');
      recentResult.CommonPrefixes.forEach(prefix => {
        console.log(`   ${prefix.Prefix}`);
      });
    }

    console.log('\n📋 Step 4: List Most Recent 10 Files (Any Date)');
    console.log('-'.repeat(80));

    const allFilesCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'documents/',
      MaxKeys: 10
    });
    const allFilesResult = await s3Client.send(allFilesCommand);

    if (allFilesResult.Contents && allFilesResult.Contents.length > 0) {
      // Sort by date descending
      const sortedFiles = allFilesResult.Contents.sort((a, b) =>
        new Date(b.LastModified) - new Date(a.LastModified)
      );

      console.log('\n📄 Most recent 10 files in bucket:\n');
      sortedFiles.forEach((file, index) => {
        const timeDiff = Date.now() - new Date(file.LastModified).getTime();
        const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
        const daysAgo = Math.floor(hoursAgo / 24);

        let timeStr = '';
        if (daysAgo > 0) {
          timeStr = `${daysAgo} days ago`;
        } else if (hoursAgo > 0) {
          timeStr = `${hoursAgo} hours ago`;
        } else {
          timeStr = 'Less than 1 hour ago';
        }

        console.log(`${index + 1}. ${file.Key}`);
        console.log(`   Size: ${(file.Size / 1024).toFixed(2)} KB`);
        console.log(`   Uploaded: ${file.LastModified} (${timeStr})\n`);
      });
    }

    // Final diagnosis
    console.log('='.repeat(80));
    console.log('📊 DIAGNOSIS');
    console.log('='.repeat(80) + '\n');

    console.log('🔍 Based on the S3 search:\n');
    console.log('   If your file is NOT found above, then:');
    console.log('   ❌ Backend is creating MongoDB records');
    console.log('   ❌ Backend is generating S3 keys/paths');
    console.log('   ❌ Backend is NOT uploading files to S3');
    console.log('   ❌ Downloads fail with "NoSuchKey" error\n');

    console.log('💡 Next Steps:');
    console.log('   1. Check backend console logs when uploading');
    console.log('   2. Look for S3 upload errors in backend logs');
    console.log('   3. Verify AWS credentials have s3:PutObject permission');
    console.log('   4. Run test-document-upload-simple.js to test the upload flow\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.name === 'NoSuchBucket') {
      console.error('\n💡 Bucket does not exist or wrong bucket name');
    } else if (error.name === 'AccessDenied') {
      console.error('\n💡 AWS credentials lack permission to access this bucket');
    } else {
      console.error('\n💡 Full error:', error);
    }
    process.exit(1);
  }
}

// Run search
findFileInS3().then(() => {
  console.log('✅ Search completed\n');
  process.exit(0);
});
