const mongoose = require('mongoose');
require('dotenv').config();

async function checkCustomerData() {
  const customerId = '68f9f1c4c197684fdb4b4e89';
  const tenantId = '68f9ec5c7af72cefe3bc79bd';

  console.log(`\n🔍 Checking data for Customer: ${customerId}`);
  console.log(`   Tenant: ${tenantId}\n`);

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_CONNECTION);
  const db = mongoose.connection.db;

  const customerObjId = new mongoose.Types.ObjectId(customerId);
  const tenantObjId = new mongoose.Types.ObjectId(tenantId);

  // 1. Check Customer
  const customer = await db.collection('customers').findOne(
    {_id: customerObjId},
    {is_delete: 1, 'company_profile.legal_name': 1, 'organisation.organisation_name': 1}
  );
  console.log('1. CUSTOMER:');
  console.log(`   - Exists: ${!!customer}`);
  console.log(`   - is_delete: ${customer?.is_delete}`);
  console.log(`   - Name: ${customer?.company_profile?.legal_name || customer?.organisation?.organisation_name}`);
  console.log('');

  // 2. Check Sites
  const sites = await db.collection('sites').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('2. SITES:');
  console.log(`   - Total count: ${sites.length}`);
  sites.forEach((site, i) => {
    console.log(`   - Site ${i+1}: ${site.site_name}`);
    console.log(`     ID: ${site._id}`);
    console.log(`     is_delete: ${site.is_delete}`);
  });
  console.log('');

  // 3. Check Buildings
  const buildings = await db.collection('buildings').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('3. BUILDINGS:');
  console.log(`   - Total count: ${buildings.length}`);
  buildings.forEach((building, i) => {
    console.log(`   - Building ${i+1}: ${building.building_name}`);
    console.log(`     ID: ${building._id}`);
    console.log(`     Site ID: ${building.site_id}`);
    console.log(`     is_delete: ${building.is_delete}`);
  });
  console.log('');

  // 4. Check Floors
  const floors = await db.collection('floors').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('4. FLOORS:');
  console.log(`   - Total count: ${floors.length}`);
  floors.forEach((floor, i) => {
    console.log(`   - Floor ${i+1}: ${floor.floor_name}`);
    console.log(`     ID: ${floor._id}`);
    console.log(`     Building ID: ${floor.building_id}`);
    console.log(`     is_delete: ${floor.is_delete}`);
  });
  console.log('');

  // 5. Check Assets
  const assets = await db.collection('assets').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('5. ASSETS:');
  console.log(`   - Total count: ${assets.length}`);
  assets.forEach((asset, i) => {
    console.log(`   - Asset ${i+1}: ${asset.asset_no || asset.asset_id}`);
    console.log(`     ID: ${asset._id}`);
    console.log(`     Building ID: ${asset.building_id}`);
    console.log(`     Floor ID: ${asset.floor_id}`);
    console.log(`     is_delete: ${asset.is_delete}`);
  });
  console.log('');

  // 6. Check Documents (customer_id is STRING!)
  const customerIdStr = customerId.toString();
  const documents = await db.collection('documents').find(
    {'customer.customer_id': customerIdStr, tenant_id: tenantObjId}
  ).toArray();
  console.log('6. DOCUMENTS:');
  console.log(`   - Total count: ${documents.length}`);
  documents.forEach((doc, i) => {
    console.log(`   - Document ${i+1}: ${doc.name}`);
    console.log(`     ID: ${doc._id}`);
    console.log(`     is_delete: ${doc.is_delete}`);
  });
  console.log('');

  // 7. Check Building Tenants
  const buildingTenants = await db.collection('buildingtenants').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('7. BUILDING TENANTS:');
  console.log(`   - Total count: ${buildingTenants.length}`);
  buildingTenants.forEach((tenant, i) => {
    console.log(`   - Tenant ${i+1}: ${tenant.tenant_legal_name || tenant.tenant_trading_name}`);
    console.log(`     ID: ${tenant._id}`);
    console.log(`     Building ID: ${tenant.building_id}`);
    console.log(`     is_delete: ${tenant.is_delete}`);
  });
  console.log('');

  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Customer: ${customer?.is_delete === true ? '✓ Soft-deleted' : '❌ NOT soft-deleted'}`);
  console.log(`Sites: ${sites.length} total, ${sites.filter(s => s.is_delete === true).length} soft-deleted`);
  console.log(`Buildings: ${buildings.length} total, ${buildings.filter(b => b.is_delete === true).length} soft-deleted`);
  console.log(`Floors: ${floors.length} total, ${floors.filter(f => f.is_delete === true).length} soft-deleted`);
  console.log(`Assets: ${assets.length} total, ${assets.filter(a => a.is_delete === true).length} soft-deleted`);
  console.log(`Documents: ${documents.length} total, ${documents.filter(d => d.is_delete === true).length} soft-deleted`);
  console.log(`Building Tenants: ${buildingTenants.length} total, ${buildingTenants.filter(t => t.is_delete === true).length} soft-deleted`);

  await mongoose.disconnect();
}

checkCustomerData().catch(console.error);
