/**
 * Migrate Remaining Collections - Add tenant_id
 *
 * This script adds tenant_id to collections that were missed in initial migration:
 * - notifications (70 records)
 * - auditlogs (85 records)
 * - documentcomments (10 records)
 * - settings (1 record)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Tenant = require('../models/Tenant');

const COLLECTIONS_TO_MIGRATE = [
  'notifications',
  'auditlogs',
  'documentcomments',
  'settings'
];

async function migrateRemainingCollections() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   Migrate Remaining Collections - Add tenant_id        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);

    // Get default tenant
    const defaultTenant = await Tenant.findOne({ tenant_name: /default/i }).sort({ created_at: 1 });

    if (!defaultTenant) {
      console.error('❌ No default tenant found. Run main migration first.');
      process.exit(1);
    }

    console.log(`Using tenant: ${defaultTenant.tenant_name} (${defaultTenant._id})\n`);

    const db = mongoose.connection.db;
    const results = [];

    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      console.log(`Processing ${collectionName}...`);

      const collection = db.collection(collectionName);

      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        console.log(`  ⊘ Collection does not exist\n`);
        continue;
      }

      const total = await collection.countDocuments({});
      console.log(`  Total records: ${total}`);

      if (total === 0) {
        console.log(`  ⊘ No records to migrate\n`);
        continue;
      }

      const without = await collection.countDocuments({ tenant_id: { $exists: false } });
      console.log(`  Records without tenant_id: ${without}`);

      if (without === 0) {
        console.log(`  ✓ All records already have tenant_id\n`);
        continue;
      }

      // Update
      const result = await collection.updateMany(
        { tenant_id: { $exists: false } },
        { $set: { tenant_id: defaultTenant._id } }
      );

      console.log(`  ✓ Updated ${result.modifiedCount} records`);

      // Verify
      const stillWithout = await collection.countDocuments({ tenant_id: { $exists: false } });
      console.log(`  Verification: ${stillWithout} records still without tenant_id\n`);

      results.push({
        collection: collectionName,
        total,
        migrated: result.modifiedCount,
        remaining: stillWithout
      });
    }

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                Migration Complete!                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    for (const result of results) {
      console.log(`  ${result.collection}: ${result.migrated}/${result.total} migrated`);
    }

    const allSuccess = results.every(r => r.remaining === 0);
    if (allSuccess) {
      console.log('\n✅ All remaining collections successfully migrated!');
    } else {
      console.log('\n⚠️  Some collections still have records without tenant_id');
    }

    process.exit(allSuccess ? 0 : 1);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateRemainingCollections();
