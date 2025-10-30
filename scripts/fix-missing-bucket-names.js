#!/usr/bin/env node

/**
 * Migration Script: Fix Missing bucket_name in Documents
 *
 * This script finds documents where file.file_meta.bucket_name is missing
 * and adds it based on the file_key prefix or uses the default bucket.
 *
 * Usage:
 *   node scripts/fix-missing-bucket-names.js [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be updated without making changes
 */

const mongoose = require('mongoose');
const Document = require('../models/Document');
const Tenant = require('../models/Tenant');

const DEFAULT_BUCKET = process.env.AWS_BUCKET || 'dev-saas-common';
const DRY_RUN = process.argv.includes('--dry-run');

async function fixMissingBucketNames() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    // Find all documents with missing bucket_name in current version
    const documentsWithMissingBucket = await Document.find({
      'file.file_meta': { $exists: true },
      'file.file_meta.bucket_name': { $exists: false }
    }).lean();

    console.log(`📊 Found ${documentsWithMissingBucket.length} documents with missing bucket_name\n`);

    if (documentsWithMissingBucket.length === 0) {
      console.log('✨ No documents need fixing!');
      await mongoose.disconnect();
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    // Build a cache of tenant buckets for efficiency
    const tenantBucketCache = new Map();
    const tenants = await Tenant.find({ s3_bucket_status: 'created' }).lean();
    tenants.forEach(tenant => {
      if (tenant.s3_bucket_name) {
        tenantBucketCache.set(tenant._id.toString(), tenant.s3_bucket_name);
      }
    });
    console.log(`📦 Loaded ${tenantBucketCache.size} tenant buckets\n`);

    for (const doc of documentsWithMissingBucket) {
      try {
        const docId = doc._id;
        const fileName = doc.file?.file_meta?.file_name || 'unknown';
        const fileKey = doc.file?.file_meta?.file_key;
        const tenantId = doc.tenant_id?.toString();

        // Determine bucket name based on tenant
        let bucketName = DEFAULT_BUCKET;

        if (tenantId && tenantBucketCache.has(tenantId)) {
          bucketName = tenantBucketCache.get(tenantId);
        }

        console.log(`📄 Document: ${docId}`);
        console.log(`   Name: ${doc.name}`);
        console.log(`   File: ${fileName}`);
        console.log(`   Tenant ID: ${tenantId || 'NONE'}`);
        console.log(`   Current bucket_name: ${doc.file?.file_meta?.bucket_name || 'MISSING'}`);
        console.log(`   Will set to: ${bucketName}`);

        if (!DRY_RUN) {
          // Update the document
          await Document.updateOne(
            { _id: docId },
            {
              $set: {
                'file.file_meta.bucket_name': bucketName,
                'updated_at': new Date()
              }
            }
          );
          console.log(`   ✅ Updated\n`);
          updatedCount++;
        } else {
          console.log(`   🔍 DRY RUN - Would update\n`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating document ${doc._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📈 Summary:');
    console.log(`   Total documents found: ${documentsWithMissingBucket.length}`);
    if (DRY_RUN) {
      console.log(`   Would update: ${documentsWithMissingBucket.length - errorCount}`);
    } else {
      console.log(`   Successfully updated: ${updatedCount}`);
      console.log(`   Errors: ${errorCount}`);
    }
    console.log('='.repeat(50) + '\n');

    if (DRY_RUN) {
      console.log('ℹ️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply changes.\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the migration
console.log('🚀 Starting migration: Fix Missing bucket_name\n');
if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No changes will be made\n');
}

fixMissingBucketNames();
