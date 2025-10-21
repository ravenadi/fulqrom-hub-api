/**
 * Verify Recent Document Uploads
 * Checks if files uploaded TODAY actually exist in S3
 */

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

const BUCKET_NAME = process.env.AWS_BUCKET || 'dev-saas-common';

const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function checkTodayUploads() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 CHECKING TODAY\'S UPLOADS IN S3');
  console.log('='.repeat(80) + '\n');

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const todayPrefix = `documents/${year}/${month}/${day}/`;

  console.log(`📅 Today's Date: ${year}-${month}-${day}`);
  console.log(`📁 Searching for: ${todayPrefix}\n`);

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: todayPrefix,
      MaxKeys: 100
    });

    const result = await s3Client.send(listCommand);

    if (result.Contents && result.Contents.length > 0) {
      console.log(`✅ Found ${result.Contents.length} file(s) uploaded today!\n`);

      result.Contents.forEach((file, index) => {
        const timeDiff = Date.now() - new Date(file.LastModified).getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));
        const hoursAgo = Math.floor(minutesAgo / 60);

        let timeStr;
        if (hoursAgo > 0) {
          timeStr = `${hoursAgo} hour(s) ${minutesAgo % 60} min ago`;
        } else {
          timeStr = `${minutesAgo} minute(s) ago`;
        }

        console.log(`${index + 1}. ${file.Key}`);
        console.log(`   Size: ${(file.Size / 1024).toFixed(2)} KB`);
        console.log(`   Uploaded: ${file.LastModified} (${timeStr})\n`);
      });

      console.log('='.repeat(80));
      console.log('✅ UPLOADS ARE WORKING!');
      console.log('='.repeat(80));
      console.log(`\n✨ ${result.Contents.length} file(s) successfully uploaded today`);
      console.log('💡 The fix is working - new uploads are reaching S3!\n');

    } else {
      console.log('❌ NO FILES UPLOADED TODAY\n');
      console.log('This means:');
      console.log('   1. No documents uploaded via the app today, OR');
      console.log('   2. Uploads are still failing\n');

      console.log('💡 Next Steps:');
      console.log('   1. Upload a test document via the frontend');
      console.log('   2. Run this script again');
      console.log('   3. Check backend logs for errors\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  }
}

checkTodayUploads().then(() => {
  process.exit(0);
});
