/**
 * Copy Tenant Data Script
 *
 * Copies all data from one tenant to another (excluding users and S3 files)
 * Maintains referential integrity by mapping old IDs to new IDs
 *
 * Usage:
 *   node scripts/copyTenantData.js <source_tenant_id> <target_tenant_id>
 *
 * Example:
 *   node scripts/copyTenantData.js 507f1f77bcf86cd799439011 507f191e810c19729de860ea
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const BuildingTenant = require('../models/BuildingTenant');
const Document = require('../models/Document');

// ID mapping storage
const idMaps = {
  customers: new Map(),
  sites: new Map(),
  buildings: new Map(),
  floors: new Map(),
  assets: new Map(),
  vendors: new Map(),
  buildingTenants: new Map()
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Copy customers from source to target tenant
 */
async function copyCustomers(sourceTenantId, targetTenantId) {
  console.log('\n📋 Copying Customers...');

  const customers = await Customer.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${customers.length} customers to copy`);

  for (const customer of customers) {
    const oldId = customer._id.toString();
    const customerData = customer.toObject();

    // Remove old IDs and set new tenant
    delete customerData._id;
    delete customerData.__v;
    delete customerData.createdAt;
    delete customerData.updatedAt;
    customerData.tenant_id = targetTenantId;

    const newCustomer = await Customer.create(customerData);
    idMaps.customers.set(oldId, newCustomer._id.toString());

    console.log(`  ✓ Copied: ${customerData.organisation?.organisation_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${customers.length} customers`);
}

/**
 * Copy sites from source to target tenant
 */
async function copySites(sourceTenantId, targetTenantId) {
  console.log('\n🏢 Copying Sites...');

  const sites = await Site.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${sites.length} sites to copy`);

  for (const site of sites) {
    const oldId = site._id.toString();
    const siteData = site.toObject();

    // Remove old IDs and update references
    delete siteData._id;
    delete siteData.__v;
    delete siteData.createdAt;
    delete siteData.updatedAt;
    siteData.tenant_id = targetTenantId;

    // Map customer_id
    if (siteData.customer_id) {
      const oldCustomerId = siteData.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        siteData.customer_id = newCustomerId;
      } else {
        console.warn(`  ⚠️  Customer not found for site: ${siteData.site_name}`);
        delete siteData.customer_id;
      }
    }

    // Reset counts
    siteData.buildings_count = 0;
    siteData.floors_count = 0;
    siteData.tenants_count = 0;
    siteData.assets_count = 0;

    const newSite = await Site.create(siteData);
    idMaps.sites.set(oldId, newSite._id.toString());

    console.log(`  ✓ Copied: ${siteData.site_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${sites.length} sites`);
}

/**
 * Copy buildings from source to target tenant
 */
async function copyBuildings(sourceTenantId, targetTenantId) {
  console.log('\n🏗️  Copying Buildings...');

  const buildings = await Building.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${buildings.length} buildings to copy`);

  for (const building of buildings) {
    const oldId = building._id.toString();
    const buildingData = building.toObject();

    // Remove old IDs and update references
    delete buildingData._id;
    delete buildingData.__v;
    delete buildingData.createdAt;
    delete buildingData.updatedAt;
    buildingData.tenant_id = targetTenantId;

    // Map site_id
    if (buildingData.site_id) {
      const oldSiteId = buildingData.site_id.toString();
      const newSiteId = idMaps.sites.get(oldSiteId);
      if (newSiteId) {
        buildingData.site_id = newSiteId;
      } else {
        console.warn(`  ⚠️  Site not found for building: ${buildingData.building_name}`);
        continue; // Skip if site not found
      }
    }

    // Map customer_id
    if (buildingData.customer_id) {
      const oldCustomerId = buildingData.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        buildingData.customer_id = newCustomerId;
      }
    }

    const newBuilding = await Building.create(buildingData);
    idMaps.buildings.set(oldId, newBuilding._id.toString());

    console.log(`  ✓ Copied: ${buildingData.building_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${buildings.length} buildings`);
}

/**
 * Copy floors from source to target tenant
 */
async function copyFloors(sourceTenantId, targetTenantId) {
  console.log('\n🔢 Copying Floors...');

  const floors = await Floor.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${floors.length} floors to copy`);

  for (const floor of floors) {
    const oldId = floor._id.toString();
    const floorData = floor.toObject();

    // Remove old IDs and update references
    delete floorData._id;
    delete floorData.__v;
    delete floorData.createdAt;
    delete floorData.updatedAt;
    floorData.tenant_id = targetTenantId;

    // Map site_id
    if (floorData.site_id) {
      const oldSiteId = floorData.site_id.toString();
      const newSiteId = idMaps.sites.get(oldSiteId);
      if (newSiteId) {
        floorData.site_id = newSiteId;
      } else {
        console.warn(`  ⚠️  Site not found for floor: ${floorData.floor_name}`);
        continue;
      }
    }

    // Map building_id
    if (floorData.building_id) {
      const oldBuildingId = floorData.building_id.toString();
      const newBuildingId = idMaps.buildings.get(oldBuildingId);
      if (newBuildingId) {
        floorData.building_id = newBuildingId;
      } else {
        console.warn(`  ⚠️  Building not found for floor: ${floorData.floor_name}`);
        continue;
      }
    }

    // Map customer_id
    if (floorData.customer_id) {
      const oldCustomerId = floorData.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        floorData.customer_id = newCustomerId;
      }
    }

    // Reset counts
    floorData.assets_count = 0;

    const newFloor = await Floor.create(floorData);
    idMaps.floors.set(oldId, newFloor._id.toString());

    console.log(`  ✓ Copied: ${floorData.floor_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${floors.length} floors`);
}

/**
 * Copy vendors from source to target tenant
 */
async function copyVendors(sourceTenantId, targetTenantId) {
  console.log('\n🔧 Copying Vendors...');

  const vendors = await Vendor.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${vendors.length} vendors to copy`);

  for (const vendor of vendors) {
    const oldId = vendor._id.toString();
    const vendorData = vendor.toObject();

    // Remove old IDs
    delete vendorData._id;
    delete vendorData.__v;
    delete vendorData.createdAt;
    delete vendorData.updatedAt;
    vendorData.tenant_id = targetTenantId;

    // Reset performance metrics
    vendorData.totalJobs = 0;
    vendorData.completedJobs = 0;
    vendorData.averageCompletionTime = 0;
    vendorData.onTimePercentage = 0;
    vendorData.lastJobDate = null;

    const newVendor = await Vendor.create(vendorData);
    idMaps.vendors.set(oldId, newVendor._id.toString());

    console.log(`  ✓ Copied: ${vendorData.contractor_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${vendors.length} vendors`);
}

/**
 * Copy assets from source to target tenant
 */
async function copyAssets(sourceTenantId, targetTenantId) {
  console.log('\n⚙️  Copying Assets...');

  const assets = await Asset.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${assets.length} assets to copy`);

  for (const asset of assets) {
    const oldId = asset._id.toString();
    const assetData = asset.toObject();

    // Remove old IDs and update references
    delete assetData._id;
    delete assetData.__v;
    delete assetData.createdAt;
    delete assetData.updatedAt;
    assetData.tenant_id = targetTenantId;

    // Map customer_id
    if (assetData.customer_id) {
      const oldCustomerId = assetData.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        assetData.customer_id = newCustomerId;
      } else {
        console.warn(`  ⚠️  Customer not found for asset: ${assetData.asset_no}`);
        continue;
      }
    }

    // Map site_id
    if (assetData.site_id) {
      const oldSiteId = assetData.site_id.toString();
      const newSiteId = idMaps.sites.get(oldSiteId);
      if (newSiteId) {
        assetData.site_id = newSiteId;
      }
    }

    // Map building_id
    if (assetData.building_id) {
      const oldBuildingId = assetData.building_id.toString();
      const newBuildingId = idMaps.buildings.get(oldBuildingId);
      if (newBuildingId) {
        assetData.building_id = newBuildingId;
      }
    }

    // Map floor_id
    if (assetData.floor_id) {
      const oldFloorId = assetData.floor_id.toString();
      const newFloorId = idMaps.floors.get(oldFloorId);
      if (newFloorId) {
        assetData.floor_id = newFloorId;
      }
    }

    const newAsset = await Asset.create(assetData);
    idMaps.assets.set(oldId, newAsset._id.toString());

    console.log(`  ✓ Copied: ${assetData.asset_no || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${assets.length} assets`);
}

/**
 * Copy building tenants from source to target tenant
 */
async function copyBuildingTenants(sourceTenantId, targetTenantId) {
  console.log('\n🏘️  Copying Building Tenants...');

  const buildingTenants = await BuildingTenant.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${buildingTenants.length} building tenants to copy`);

  for (const buildingTenant of buildingTenants) {
    const oldId = buildingTenant._id.toString();
    const tenantData = buildingTenant.toObject();

    // Remove old IDs and update references
    delete tenantData._id;
    delete tenantData.__v;
    delete tenantData.createdAt;
    delete tenantData.updatedAt;
    tenantData.tenant_id = targetTenantId;

    // Map customer_id
    if (tenantData.customer_id) {
      const oldCustomerId = tenantData.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        tenantData.customer_id = newCustomerId;
      }
    }

    // Map site_id
    if (tenantData.site_id) {
      const oldSiteId = tenantData.site_id.toString();
      const newSiteId = idMaps.sites.get(oldSiteId);
      if (newSiteId) {
        tenantData.site_id = newSiteId;
      }
    }

    // Map building_id
    if (tenantData.building_id) {
      const oldBuildingId = tenantData.building_id.toString();
      const newBuildingId = idMaps.buildings.get(oldBuildingId);
      if (newBuildingId) {
        tenantData.building_id = newBuildingId;
      }
    }

    // Map floor_id
    if (tenantData.floor_id) {
      const oldFloorId = tenantData.floor_id.toString();
      const newFloorId = idMaps.floors.get(oldFloorId);
      if (newFloorId) {
        tenantData.floor_id = newFloorId;
      }
    }

    const newBuildingTenant = await BuildingTenant.create(tenantData);
    idMaps.buildingTenants.set(oldId, newBuildingTenant._id.toString());

    console.log(`  ✓ Copied: ${tenantData.tenant_trading_name || tenantData.tenant_legal_name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${buildingTenants.length} building tenants`);
}

/**
 * Copy documents from source to target tenant (metadata only, no S3 files)
 */
async function copyDocuments(sourceTenantId, targetTenantId) {
  console.log('\n📄 Copying Documents (metadata only, no S3 files)...');

  const documents = await Document.find({
    tenant_id: sourceTenantId,
    is_delete: false
  }).setOptions({ skipTenantFilter: true });

  console.log(`Found ${documents.length} documents to copy`);

  for (const document of documents) {
    const documentData = document.toObject();

    // Remove old IDs
    delete documentData._id;
    delete documentData.__v;
    documentData.tenant_id = targetTenantId;

    // Map customer
    if (documentData.customer && documentData.customer.customer_id) {
      const oldCustomerId = documentData.customer.customer_id.toString();
      const newCustomerId = idMaps.customers.get(oldCustomerId);
      if (newCustomerId) {
        documentData.customer.customer_id = newCustomerId;
      } else {
        console.warn(`  ⚠️  Customer not found for document: ${documentData.name}`);
        continue;
      }
    }

    // Map location references
    if (documentData.location) {
      // Map site
      if (documentData.location.site && documentData.location.site.site_id) {
        const oldSiteId = documentData.location.site.site_id;
        const newSiteId = idMaps.sites.get(oldSiteId);
        if (newSiteId) {
          documentData.location.site.site_id = newSiteId;
        }
      }

      // Map building
      if (documentData.location.building && documentData.location.building.building_id) {
        const oldBuildingId = documentData.location.building.building_id;
        const newBuildingId = idMaps.buildings.get(oldBuildingId);
        if (newBuildingId) {
          documentData.location.building.building_id = newBuildingId;
        }
      }

      // Map floor
      if (documentData.location.floor && documentData.location.floor.floor_id) {
        const oldFloorId = documentData.location.floor.floor_id;
        const newFloorId = idMaps.floors.get(oldFloorId);
        if (newFloorId) {
          documentData.location.floor.floor_id = newFloorId;
        }
      }

      // Map assets
      if (documentData.location.assets && documentData.location.assets.length > 0) {
        documentData.location.assets = documentData.location.assets.map(asset => {
          if (asset.asset_id) {
            const oldAssetId = asset.asset_id;
            const newAssetId = idMaps.assets.get(oldAssetId);
            if (newAssetId) {
              return { ...asset, asset_id: newAssetId };
            }
          }
          return asset;
        });
      }

      // Map legacy single asset
      if (documentData.location.asset && documentData.location.asset.asset_id) {
        const oldAssetId = documentData.location.asset.asset_id;
        const newAssetId = idMaps.assets.get(oldAssetId);
        if (newAssetId) {
          documentData.location.asset.asset_id = newAssetId;
        }
      }

      // Map tenant (building tenant)
      if (documentData.location.tenant && documentData.location.tenant.tenant_id) {
        const oldTenantId = documentData.location.tenant.tenant_id;
        const newTenantId = idMaps.buildingTenants.get(oldTenantId);
        if (newTenantId) {
          documentData.location.tenant.tenant_id = newTenantId;
        }
      }

      // Map vendor
      if (documentData.location.vendor && documentData.location.vendor.vendor_id) {
        const oldVendorId = documentData.location.vendor.vendor_id;
        const newVendorId = idMaps.vendors.get(oldVendorId);
        if (newVendorId) {
          documentData.location.vendor.vendor_id = newVendorId;
        }
      }
    }

    // Note: S3 file URLs are NOT copied - these would need manual handling
    if (documentData.file && documentData.file.file_meta) {
      console.warn(`  ⚠️  Document has file attachment (not copied): ${documentData.name}`);
      // Clear file info to indicate no file attached
      documentData.file.file_meta.file_url = '';
      documentData.file.file_meta.file_path = '';
      documentData.file.file_meta.file_key = '';
    }

    const newDocument = await Document.create(documentData);
    console.log(`  ✓ Copied: ${documentData.name || 'Unnamed'}`);
  }

  console.log(`✅ Copied ${documents.length} documents`);
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('❌ Usage: node copyTenantData.js <source_tenant_id> <target_tenant_id>');
    process.exit(1);
  }

  const sourceTenantId = args[0];
  const targetTenantId = args[1];

  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(sourceTenantId)) {
    console.error('❌ Invalid source tenant ID');
    process.exit(1);
  }

  if (!mongoose.Types.ObjectId.isValid(targetTenantId)) {
    console.error('❌ Invalid target tenant ID');
    process.exit(1);
  }

  console.log('🚀 Starting tenant data copy...');
  console.log(`   Source Tenant: ${sourceTenantId}`);
  console.log(`   Target Tenant: ${targetTenantId}`);
  console.log('   Note: Users and S3 files will NOT be copied\n');

  await connectDB();

  try {
    // Copy in order to maintain referential integrity
    await copyCustomers(sourceTenantId, targetTenantId);
    await copySites(sourceTenantId, targetTenantId);
    await copyBuildings(sourceTenantId, targetTenantId);
    await copyFloors(sourceTenantId, targetTenantId);
    await copyVendors(sourceTenantId, targetTenantId);
    await copyAssets(sourceTenantId, targetTenantId);
    await copyBuildingTenants(sourceTenantId, targetTenantId);
    await copyDocuments(sourceTenantId, targetTenantId);

    console.log('\n✅ All data copied successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Customers:        ${idMaps.customers.size}`);
    console.log(`   Sites:            ${idMaps.sites.size}`);
    console.log(`   Buildings:        ${idMaps.buildings.size}`);
    console.log(`   Floors:           ${idMaps.floors.size}`);
    console.log(`   Vendors:          ${idMaps.vendors.size}`);
    console.log(`   Assets:           ${idMaps.assets.size}`);
    console.log(`   Building Tenants: ${idMaps.buildingTenants.size}`);

  } catch (error) {
    console.error('\n❌ Error during copy:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
main();