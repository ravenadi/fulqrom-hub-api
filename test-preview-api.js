/**
 * Test script to check what the API actually sees for the document
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

async function testDocumentData() {
  try {
    console.log('🔍 Testing document data as seen by API...\n');

    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    const documentId = '68f9f50b72b47b295fe282cb';

    // Fetch the document
    const document = await Document.findById(documentId);

    if (!document) {
      console.log('❌ Document not found');
      return;
    }

    console.log('📄 Document found!');
    console.log('   ID:', document._id);
    console.log('   Name:', document.name);
    console.log();

    console.log('📦 File metadata:');
    if (document.file && document.file.file_meta) {
      const fileMeta = document.file.file_meta;
      console.log('   file_name:', fileMeta.file_name);
      console.log('   file_type:', fileMeta.file_type);
      console.log('   file_key:', fileMeta.file_key);
      console.log('   bucket_name:', fileMeta.bucket_name);
      console.log('   file_url:', fileMeta.file_url);
      console.log();

      // Check bucket routing logic
      console.log('🔀 Bucket routing logic check:');
      const sharedBucket = process.env.AWS_BUCKET;
      console.log('   Shared bucket (AWS_BUCKET):', sharedBucket);
      console.log('   Document bucket_name:', fileMeta.bucket_name);
      console.log('   Has bucket_name?', !!fileMeta.bucket_name);
      console.log('   Different from shared?', fileMeta.bucket_name !== sharedBucket);

      if (fileMeta.bucket_name && fileMeta.bucket_name !== sharedBucket) {
        console.log('   ✅ Would route to TENANT bucket service');
      } else {
        console.log('   ⚠️  Would route to SHARED bucket service');
      }
    } else {
      console.log('   ❌ No file metadata found');
    }

    await mongoose.connection.close();
    console.log('\n✅ Test complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDocumentData();
