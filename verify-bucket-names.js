/**
 * Verification script to check if bucket_name was properly set
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

async function verifyBucketNames() {
  try {
    console.log('🔍 Verifying bucket_name updates...\n');

    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    // Check the specific document from the screenshot
    const specificDoc = await Document.findById('68f9f50b72b47b295fe282cb');

    if (specificDoc) {
      console.log('📄 Document 68f9f50b72b47b295fe282cb:');
      console.log('   Tenant ID:', specificDoc.tenant_id);
      console.log('   Customer ID:', specificDoc.customer_id);
      console.log('   File Key:', specificDoc.file?.file_meta?.file_key);
      console.log('   Bucket Name:', specificDoc.file?.file_meta?.bucket_name);
      console.log('   File URL:', specificDoc.file?.file_meta?.file_url);
      console.log();
    } else {
      console.log('❌ Document 68f9f50b72b47b295fe282cb not found\n');
    }

    // Check how many documents have bucket_name now
    const totalDocs = await Document.countDocuments();
    const docsWithBucket = await Document.countDocuments({
      'file.file_meta.bucket_name': { $exists: true }
    });
    const docsWithoutBucket = await Document.countDocuments({
      'file.file_meta.bucket_name': { $exists: false }
    });

    console.log('📊 Database Stats:');
    console.log(`   Total documents: ${totalDocs}`);
    console.log(`   Documents with bucket_name: ${docsWithBucket}`);
    console.log(`   Documents without bucket_name: ${docsWithoutBucket}`);
    console.log();

    // Sample a few documents with bucket names
    const sampleDocs = await Document.find({
      'file.file_meta.bucket_name': { $exists: true }
    }).limit(5).select('_id file.file_meta.bucket_name file.file_meta.file_key tenant_id');

    console.log('📋 Sample of documents with bucket_name:');
    sampleDocs.forEach(doc => {
      console.log(`   ${doc._id}: ${doc.file?.file_meta?.bucket_name} | Key: ${doc.file?.file_meta?.file_key}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Verification complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyBucketNames();
