/**
 * Fix Incomplete Cascade - Handles already soft-deleted parents
 * Use when parent is soft-deleted but children are not
 * Uses direct MongoDB queries to bypass tenant middleware
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixIncompleteCascade(customerId, tenantId) {
  try {
    console.log('\n🔧 Fixing Incomplete Cascade');
    console.log(`Customer ID: ${customerId}`);
    console.log(`Tenant ID: ${tenantId}\n`);

    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_CONNECTION);
    console.log('✓ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const customerObjId = new mongoose.Types.ObjectId(customerId);
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    // Find ALL sites for this customer (regardless of is_delete status)
    const sites = await db.collection('sites').find({
      customer_id: customerObjId,
      tenant_id: tenantObjId
    }).toArray();

    console.log(`Found ${sites.length} total sites (including already soft-deleted)`);

    for (const site of sites) {
      console.log(`\nProcessing Site: ${site.site_name} (${site._id})`);
      console.log(`  Site is_delete: ${site.is_delete}`);

      // Find ALL buildings for this site
      const buildings = await db.collection('buildings').find({
        site_id: site._id,
        tenant_id: tenantObjId
      }).toArray();

      console.log(`  Found ${buildings.length} buildings`);

      for (const building of buildings) {
        console.log(`    Building: ${building.building_name} (${building._id})`);
        console.log(`      Current is_delete: ${building.is_delete}`);

        if (!building.is_delete) {
          // Soft-delete building
          await db.collection('buildings').updateOne(
            { _id: building._id },
            { $set: { is_delete: true } }
          );
          console.log(`      ✓ Soft-deleted building`);
        }

        // Find ALL floors for this building
        const floors = await db.collection('floors').find({
          building_id: building._id,
          tenant_id: tenantObjId
        }).toArray();

        console.log(`      Found ${floors.length} floors`);

        for (const floor of floors) {
          console.log(`        Floor: ${floor.floor_name} (${floor._id})`);
          console.log(`          Current is_delete: ${floor.is_delete}`);

          if (!floor.is_delete) {
            await db.collection('floors').updateOne(
              { _id: floor._id },
              { $set: { is_delete: true } }
            );
            console.log(`          ✓ Soft-deleted floor`);
          }

          // Soft-delete assets on this floor
          const floorAssets = await db.collection('assets').updateMany(
            { floor_id: floor._id, tenant_id: tenantObjId, is_delete: false },
            { $set: { is_delete: true } }
          );
          if (floorAssets.modifiedCount > 0) {
            console.log(`          ✓ Soft-deleted ${floorAssets.modifiedCount} assets on floor`);
          }
        }

        // Soft-delete building-level assets (not on a specific floor)
        const buildingAssets = await db.collection('assets').updateMany(
          { building_id: building._id, tenant_id: tenantObjId, is_delete: false },
          { $set: { is_delete: true } }
        );
        if (buildingAssets.modifiedCount > 0) {
          console.log(`      ✓ Soft-deleted ${buildingAssets.modifiedCount} building-level assets`);
        }

        // Soft-delete building tenants
        const buildingTenants = await db.collection('buildingtenants').updateMany(
          { building_id: building._id, tenant_id: tenantObjId, is_delete: false },
          { $set: { is_delete: true } }
        );
        if (buildingTenants.modifiedCount > 0) {
          console.log(`      ✓ Soft-deleted ${buildingTenants.modifiedCount} building tenants`);
        }
      }

      // Soft-delete the site if not already
      if (!site.is_delete) {
        await db.collection('sites').updateOne(
          { _id: site._id },
          { $set: { is_delete: true } }
        );
        console.log(`  ✓ Soft-deleted site`);
      }
    }

    // Soft-delete documents (customer_id is STRING)
    const customerIdStr = customerId.toString();
    const docs = await db.collection('documents').updateMany(
      { 'customer.customer_id': customerIdStr, tenant_id: tenantObjId, is_delete: false },
      { $set: { is_delete: true } }
    );
    if (docs.modifiedCount > 0) {
      console.log(`\n✓ Soft-deleted ${docs.modifiedCount} documents`);
    }

    console.log('\n✅ Fix completed!');
    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node fixIncompleteCascade.js <customerId> <tenantId>');
    process.exit(1);
  }

  const [customerId, tenantId] = args;
  fixIncompleteCascade(customerId, tenantId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { fixIncompleteCascade };
