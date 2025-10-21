/**
 * Check all models for tenant_id requirement
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkAllModels() {
  try {
    const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);

    console.log('Checking all collections in database...\n');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log('Collection Name'.padEnd(25) + 'Count'.padEnd(10) + 'Has tenant_id?');
    console.log('═'.repeat(60));

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = db.collection(collectionName);

      const total = await collection.countDocuments({});

      if (total === 0) {
        console.log(`${collectionName.padEnd(25)}${String(0).padEnd(10)}N/A (empty)`);
        continue;
      }

      // Check if any document has tenant_id field
      const withTenantId = await collection.countDocuments({ tenant_id: { $exists: true } });
      const hasTenantId = withTenantId > 0;

      const status = hasTenantId
        ? (withTenantId === total ? `✓ ${withTenantId}/${total}` : `⚠️  ${withTenantId}/${total}`)
        : `❌ 0/${total}`;

      console.log(`${collectionName.padEnd(25)}${String(total).padEnd(10)}${status}`);
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllModels();
