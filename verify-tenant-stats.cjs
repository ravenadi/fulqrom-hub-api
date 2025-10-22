/**
 * Direct Database Verification Script
 * This script connects directly to MongoDB and shows the actual counts
 * Run with: node verify-tenant-stats.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Import models
const Tenant = require('./models/Tenant');
const Plan = require('./models/Plan');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Site = require('./models/Site');
const Building = require('./models/Building');
const Floor = require('./models/Floor');
const BuildingTenant = require('./models/BuildingTenant');
const Asset = require('./models/Asset');
const Vendor = require('./models/Vendor');
const Document = require('./models/Document');

async function verifyTenantStats() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');
    console.log('='.repeat(80));

    // Get first tenant
    const tenant = await Tenant.findOne().populate('plan_id', 'name price time_period').lean();

    if (!tenant) {
      console.log('❌ No tenants found in database');
      process.exit(0);
    }

    console.log(`\n🏢 Tenant: ${tenant.tenant_name}`);
    console.log(`📋 ID: ${tenant._id}`);
    console.log(`📊 Status: ${tenant.status}`);
    console.log('\n' + '─'.repeat(80) + '\n');

    // Get customer IDs for this tenant
    console.log('🔍 Getting customer IDs for tenant...');
    const customerIds = await Customer.find({ tenant_id: tenant._id }).distinct('_id');
    console.log(`   Found ${customerIds.length} customers\n`);

    // Count all entities
    console.log('📊 Counting entities...\n');

    const [
      usersCount,
      customersCount,
      sitesCount,
      buildingsCount,
      floorsCount,
      buildingTenantsCount,
      assetsCount,
      documentsCount,
      vendorsCount
    ] = await Promise.all([
      User.countDocuments({ tenant_id: tenant._id }),
      Customer.countDocuments({ tenant_id: tenant._id }),
      Site.countDocuments({ customer_id: { $in: customerIds } }),
      Building.countDocuments({ customer_id: { $in: customerIds } }),
      Floor.countDocuments({ customer_id: { $in: customerIds } }),
      BuildingTenant.countDocuments({ customer_id: { $in: customerIds } }),
      Asset.countDocuments({ customer_id: { $in: customerIds } }),
      Document.countDocuments({ tenant_id: tenant._id }),
      Vendor.countDocuments({ tenant_id: tenant._id })
    ]);

    // Calculate storage
    const storageAggregation = await Document.aggregate([
      { $match: { tenant_id: tenant._id } },
      {
        $group: {
          _id: null,
          totalSize: { $sum: { $ifNull: ['$file.file_meta.file_size', 0] } }
        }
      }
    ]);
    const totalStorageBytes = storageAggregation.length > 0 ? storageAggregation[0].totalSize : 0;
    const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(2);

    // Display results
    console.log('✅ COUNT RESULTS:');
    console.log('─'.repeat(80));
    console.log(`   Customers:         ${customersCount}`);
    console.log(`   Sites:             ${sitesCount}`);
    console.log(`   Buildings:         ${buildingsCount}`);
    console.log(`   Floors:            ${floorsCount}`);
    console.log(`   Building Tenants:  ${buildingTenantsCount}`);
    console.log(`   Documents:         ${documentsCount}`);
    console.log(`   Assets:            ${assetsCount}`);
    console.log(`   Vendors:           ${vendorsCount}`);
    console.log(`   Users:             ${usersCount}`);
    console.log(`   Storage (bytes):   ${totalStorageBytes}`);
    console.log(`   Storage (MB):      ${totalStorageMB} MB`);
    console.log('─'.repeat(80));

    // Show what the API will return
    console.log('\n📦 API RESPONSE FORMAT:');
    console.log('─'.repeat(80));
    const apiResponse = {
      id: tenant._id,
      name: tenant.tenant_name,
      status: tenant.status,
      plan: tenant.plan_id ? {
        id: tenant.plan_id._id,
        name: tenant.plan_id.name,
        price: tenant.plan_id.price,
        time_period: tenant.plan_id.time_period
      } : null,
      customers_count: customersCount,
      sites_count: sitesCount,
      buildings_count: buildingsCount,
      floors_count: floorsCount,
      building_tenants_count: buildingTenantsCount,
      documents_count: documentsCount,
      assets_count: assetsCount,
      vendors_count: vendorsCount,
      users_count: usersCount,
      storage_used_bytes: totalStorageBytes,
      storage_used_mb: totalStorageMB
    };

    console.log(JSON.stringify(apiResponse, null, 2));
    console.log('─'.repeat(80));

    // Verify fields
    console.log('\n✓ FIELD VERIFICATION:');
    console.log('─'.repeat(80));
    const requiredFields = [
      'customers_count',
      'sites_count',
      'buildings_count',
      'floors_count',
      'building_tenants_count',
      'documents_count',
      'assets_count',
      'vendors_count',
      'users_count',
      'storage_used_bytes',
      'storage_used_mb'
    ];

    requiredFields.forEach(field => {
      const hasField = field in apiResponse;
      const value = apiResponse[field];
      const status = hasField && value !== undefined ? '✅' : '❌';
      console.log(`   ${status} ${field.padEnd(25)} = ${value}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Verification Complete!\n');

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
verifyTenantStats();
