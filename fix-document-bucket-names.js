/**
 * Migration script to add bucket_name to existing documents
 * This fixes documents that were uploaded to tenant buckets but don't have bucket_name in metadata
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');
const Tenant = require('./models/Tenant');

async function fixDocumentBucketNames() {
  try {
    console.log('🔧 Starting document bucket_name migration...\n');

    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    // Find all documents without bucket_name
    const documentsWithoutBucket = await Document.find({
      'file.file_meta.bucket_name': { $exists: false }
    });

    console.log(`📊 Found ${documentsWithoutBucket.length} documents without bucket_name\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of documentsWithoutBucket) {
      try {
        const tenantId = doc.tenant_id;

        if (!tenantId) {
          console.log(`⏭️  Skipping document ${doc._id} - no tenant_id`);
          skipped++;
          continue;
        }

        // Get tenant to find bucket name
        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
          console.log(`⚠️  Warning: Tenant ${tenantId} not found for document ${doc._id}`);
          skipped++;
          continue;
        }

        let bucketName;

        // Check if tenant has a specific bucket
        if (tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
          bucketName = tenant.s3_bucket_name;
          console.log(`📦 Document ${doc._id} -> Tenant bucket: ${bucketName}`);
        } else {
          // Fallback to shared bucket
          bucketName = process.env.AWS_BUCKET;
          console.log(`📦 Document ${doc._id} -> Shared bucket: ${bucketName}`);
        }

        // Update document
        await Document.updateOne(
          { _id: doc._id },
          { $set: { 'file.file_meta.bucket_name': bucketName } }
        );

        fixed++;
      } catch (error) {
        console.error(`❌ Error fixing document ${doc._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📝 Total processed: ${documentsWithoutBucket.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Migration complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixDocumentBucketNames();
