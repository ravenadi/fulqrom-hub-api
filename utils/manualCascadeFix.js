/**
 * Manual Cascade Fix Script
 * Use this to manually cascade soft-delete for an already deleted customer
 *
 * Usage: node rest-api/utils/manualCascadeFix.js <customerId> <tenantId>
 * Example: node rest-api/utils/manualCascadeFix.js 68f9f1c4c197684fdb4b4e89 68f9ec5c7af72cefe3bc79bd
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const BuildingTenant = require('../models/BuildingTenant');

async function manualCascadeFix(customerId, tenantId) {
  try {
    console.log('\n🔧 Manual Cascade Fix Script');
    console.log(`Customer ID: ${customerId}`);
    console.log(`Tenant ID: ${tenantId}\n`);

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_CONNECTION);
    console.log('✓ Connected to MongoDB\n');

    const customerObjId = new mongoose.Types.ObjectId(customerId);
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);
    const customerIdStr = customerId.toString();

    // 1. Find and soft-delete Sites
    console.log('1. Finding sites...');
    const sites = await Site.find({
      customer_id: customerObjId,
      tenant_id: tenantObjId,
      is_delete: false
    });
    console.log(`   Found ${sites.length} sites`);

    for (const site of sites) {
      console.log(`   - Processing site: ${site.site_name} (${site._id})`);

      // Find buildings for this site
      const buildings = await Building.find({
        site_id: site._id,
        tenant_id: tenantObjId,
        is_delete: false
      });
      console.log(`     Found ${buildings.length} buildings`);

      for (const building of buildings) {
        console.log(`     - Processing building: ${building.building_name} (${building._id})`);

        // Find floors for this building
        const floors = await Floor.find({
          building_id: building._id,
          tenant_id: tenantObjId,
          is_delete: false
        });
        console.log(`       Found ${floors.length} floors`);

        // Soft-delete assets in each floor
        for (const floor of floors) {
          const floorAssets = await Asset.updateMany(
            { floor_id: floor._id, tenant_id: tenantObjId, is_delete: false },
            { is_delete: true }
          );
          console.log(`         Soft-deleted ${floorAssets.modifiedCount} assets from floor ${floor.floor_name}`);
        }

        // Soft-delete floors
        const floorResult = await Floor.updateMany(
          { building_id: building._id, tenant_id: tenantObjId, is_delete: false },
          { is_delete: true }
        );
        console.log(`       Soft-deleted ${floorResult.modifiedCount} floors`);

        // Soft-delete assets in building (not on specific floor)
        const buildingAssets = await Asset.updateMany(
          { building_id: building._id, tenant_id: tenantObjId, is_delete: false },
          { is_delete: true }
        );
        console.log(`       Soft-deleted ${buildingAssets.modifiedCount} building-level assets`);

        // Soft-delete building tenants
        const buildingTenantResult = await BuildingTenant.updateMany(
          { building_id: building._id, tenant_id: tenantObjId, is_delete: false },
          { is_delete: true }
        );
        console.log(`       Soft-deleted ${buildingTenantResult.modifiedCount} building tenants`);
      }

      // Soft-delete all buildings for this site
      const buildingResult = await Building.updateMany(
        { site_id: site._id, tenant_id: tenantObjId, is_delete: false },
        { is_delete: true }
      );
      console.log(`     Soft-deleted ${buildingResult.modifiedCount} total buildings for site`);
    }

    // Soft-delete all sites
    const siteResult = await Site.updateMany(
      { customer_id: customerObjId, tenant_id: tenantObjId, is_delete: false },
      { is_delete: true }
    );
    console.log(`   Soft-deleted ${siteResult.modifiedCount} total sites\n`);

    // 2. Soft-delete Documents (customer_id is stored as STRING)
    console.log('2. Finding documents...');
    const docResult = await Document.updateMany(
      { 'customer.customer_id': customerIdStr, tenant_id: tenantObjId, is_delete: false },
      { is_delete: true }
    );
    console.log(`   Soft-deleted ${docResult.modifiedCount} documents\n`);

    // 3. Summary
    console.log('✅ Manual cascade fix completed!\n');
    console.log('Summary:');
    console.log(`  - Sites soft-deleted: ${siteResult.modifiedCount}`);
    console.log(`  - Documents soft-deleted: ${docResult.modifiedCount}`);
    console.log(`  - All related buildings, floors, assets, and building tenants also cascaded\n`);

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error during manual cascade fix:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node manualCascadeFix.js <customerId> <tenantId>');
    console.error('Example: node manualCascadeFix.js 68f9f1c4c197684fdb4b4e89 68f9ec5c7af72cefe3bc79bd');
    process.exit(1);
  }

  const [customerId, tenantId] = args;
  manualCascadeFix(customerId, tenantId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { manualCascadeFix };
