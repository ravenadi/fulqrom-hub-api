/**
 * Fix Document tenant_id migration
 *
 * This script specifically handles updating Document records that are missing tenant_id
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Tenant = require('../models/Tenant');

async function fixDocuments() {
  try {
    console.log('Connecting to MongoDB...');
    const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;

    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Get default tenant
    const defaultTenant = await Tenant.findOne({ tenant_name: /default/i }).sort({ created_at: 1 });

    if (!defaultTenant) {
      console.error('❌ No default tenant found. Run main migration first.');
      process.exit(1);
    }

    console.log(`Using tenant: ${defaultTenant.tenant_name} (${defaultTenant._id})\n`);

    // Use native MongoDB collection to bypass Mongoose middleware
    const db = mongoose.connection.db;
    const documentsCollection = db.collection('documents');

    // Count documents without tenant_id
    const countBefore = await documentsCollection.countDocuments({ tenant_id: { $exists: false } });
    console.log(`Documents without tenant_id: ${countBefore}`);

    if (countBefore === 0) {
      console.log('✓ All documents already have tenant_id');
      process.exit(0);
    }

    // Update using native driver
    const result = await documentsCollection.updateMany(
      { tenant_id: { $exists: false } },
      { $set: { tenant_id: defaultTenant._id } }
    );

    console.log(`✓ Updated ${result.modifiedCount} documents`);

    // Verify
    const countAfter = await documentsCollection.countDocuments({ tenant_id: { $exists: false } });
    console.log(`Documents still without tenant_id: ${countAfter}`);

    if (countAfter === 0) {
      console.log('\n✅ All documents now have tenant_id!');
    } else {
      console.log('\n⚠️  Some documents still missing tenant_id');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDocuments();
