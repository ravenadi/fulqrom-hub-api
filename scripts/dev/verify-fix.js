const mongoose = require('mongoose');
require('dotenv').config();

async function verifyFix() {
  const customerId = '68f9f1c4c197684fdb4b4e89';
  const tenantId = '68f9ec5c7af72cefe3bc79bd';

  console.log('\n========================================');
  console.log('VERIFYING CASCADE FIX');
  console.log('========================================\n');

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_CONNECTION);
  const db = mongoose.connection.db;

  const customerObjId = new mongoose.Types.ObjectId(customerId);
  const tenantObjId = new mongoose.Types.ObjectId(tenantId);

  // Check Customer
  const customer = await db.collection('customers').findOne(
    {_id: customerObjId},
    {is_delete: 1, 'organisation.organisation_name': 1}
  );
  console.log('1. CUSTOMER:');
  console.log(`   - ID: ${customerId}`);
  console.log(`   - is_delete: ${customer?.is_delete}`);
  console.log(`   - Status: ${customer?.is_delete === true ? '✅ Soft-deleted' : '❌ NOT deleted'}`);
  console.log('');

  // Check Sites
  const sites = await db.collection('sites').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('2. SITES:');
  console.log(`   - Total count: ${sites.length}`);
  sites.forEach((site) => {
    console.log(`   - ${site.site_name}: is_delete=${site.is_delete} ${site.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  // Check Buildings
  const buildings = await db.collection('buildings').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('3. BUILDINGS:');
  console.log(`   - Total count: ${buildings.length}`);
  buildings.forEach((building) => {
    console.log(`   - ${building.building_name}: is_delete=${building.is_delete} ${building.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  // Check Floors
  const floors = await db.collection('floors').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('4. FLOORS:');
  console.log(`   - Total count: ${floors.length}`);
  floors.forEach((floor) => {
    console.log(`   - ${floor.floor_name}: is_delete=${floor.is_delete} ${floor.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  // Check Assets
  const assets = await db.collection('assets').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('5. ASSETS:');
  console.log(`   - Total count: ${assets.length}`);
  assets.forEach((asset) => {
    console.log(`   - ${asset.asset_no || asset.asset_id}: is_delete=${asset.is_delete} ${asset.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  // Check Documents (customer_id is STRING!)
  const customerIdStr = customerId.toString();
  const documents = await db.collection('documents').find(
    {'customer.customer_id': customerIdStr, tenant_id: tenantObjId}
  ).toArray();
  console.log('6. DOCUMENTS:');
  console.log(`   - Total count: ${documents.length}`);
  documents.forEach((doc) => {
    console.log(`   - ${doc.name}: is_delete=${doc.is_delete} ${doc.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  // Check Building Tenants
  const buildingTenants = await db.collection('buildingtenants').find(
    {customer_id: customerObjId, tenant_id: tenantObjId}
  ).toArray();
  console.log('7. BUILDING TENANTS:');
  console.log(`   - Total count: ${buildingTenants.length}`);
  buildingTenants.forEach((tenant) => {
    console.log(`   - ${tenant.tenant_legal_name || tenant.tenant_trading_name}: is_delete=${tenant.is_delete} ${tenant.is_delete === true ? '✅' : '❌'}`);
  });
  console.log('');

  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const allDeleted =
    customer?.is_delete === true &&
    sites.every(s => s.is_delete === true) &&
    buildings.every(b => b.is_delete === true) &&
    floors.every(f => f.is_delete === true) &&
    assets.every(a => a.is_delete === true) &&
    (documents.length === 0 || documents.every(d => d.is_delete === true)) &&
    (buildingTenants.length === 0 || buildingTenants.every(t => t.is_delete === true));

  if (allDeleted) {
    console.log('✅ SUCCESS! All records properly soft-deleted!');
    console.log('   CASCADE FIX WORKED PERFECTLY!');
  } else {
    console.log('❌ FAILURE! Some records still not soft-deleted:');
    if (customer?.is_delete !== true) console.log('   - Customer NOT deleted');
    if (sites.some(s => s.is_delete !== true)) console.log(`   - ${sites.filter(s => s.is_delete !== true).length} Sites NOT deleted`);
    if (buildings.some(b => b.is_delete !== true)) console.log(`   - ${buildings.filter(b => b.is_delete !== true).length} Buildings NOT deleted`);
    if (floors.some(f => f.is_delete !== true)) console.log(`   - ${floors.filter(f => f.is_delete !== true).length} Floors NOT deleted`);
    if (assets.some(a => a.is_delete !== true)) console.log(`   - ${assets.filter(a => a.is_delete !== true).length} Assets NOT deleted`);
    if (documents.some(d => d.is_delete !== true)) console.log(`   - ${documents.filter(d => d.is_delete !== true).length} Documents NOT deleted`);
    if (buildingTenants.some(t => t.is_delete !== true)) console.log(`   - ${buildingTenants.filter(t => t.is_delete !== true).length} Building Tenants NOT deleted`);
  }

  await mongoose.disconnect();
}

verifyFix().catch(console.error);
