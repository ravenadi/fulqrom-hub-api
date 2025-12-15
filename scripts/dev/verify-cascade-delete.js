const mongoose = require('mongoose');
require('dotenv').config();

async function verifyCascade() {
  const ids = require('fs').readFileSync('/tmp/test_ids.txt', 'utf8').trim().split('|');
  const [CUSTOMER_ID, SITE_ID, BUILDING_ID, FLOOR_ID, ASSET_ID] = ids;

  console.log('\n========================================');
  console.log('VERIFYING CASCADE SOFT DELETE');
  console.log('========================================\n');

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_CONNECTION);

  const db = mongoose.connection.db;

  // Check Customer
  const customer = await db.collection('customers').findOne({_id: new mongoose.Types.ObjectId(CUSTOMER_ID)}, {is_delete: 1, 'organisation.organisation_name': 1});
  console.log(`✓ Customer ${CUSTOMER_ID}:`);
  console.log(`  - is_delete: ${customer?.is_delete}`);
  console.log(`  - Name: ${customer?.organisation?.organisation_name}`);
  console.log(``);

  // Check Site
  const site = await db.collection('sites').findOne({_id: new mongoose.Types.ObjectId(SITE_ID)}, {is_delete: 1, site_name: 1});
  console.log(`✓ Site ${SITE_ID}:`);
  console.log(`  - is_delete: ${site?.is_delete}`);
  console.log(`  - Name: ${site?.site_name}`);
  console.log(``);

  // Check Building
  const building = await db.collection('buildings').findOne({_id: new mongoose.Types.ObjectId(BUILDING_ID)}, {is_delete: 1, building_name: 1});
  console.log(`✓ Building ${BUILDING_ID}:`);
  console.log(`  - is_delete: ${building?.is_delete}`);
  console.log(`  - Name: ${building?.building_name}`);
  console.log(``);

  // Check Floor
  const floor = await db.collection('floors').findOne({_id: new mongoose.Types.ObjectId(FLOOR_ID)}, {is_delete: 1, floor_name: 1});
  console.log(`✓ Floor ${FLOOR_ID}:`);
  console.log(`  - is_delete: ${floor?.is_delete}`);
  console.log(`  - Name: ${floor?.floor_name}`);
  console.log(``);

  // Check Asset
  const asset = await db.collection('assets').findOne({_id: new mongoose.Types.ObjectId(ASSET_ID)}, {is_delete: 1, asset_no: 1});
  console.log(`✓ Asset ${ASSET_ID}:`);
  console.log(`  - is_delete: ${asset?.is_delete}`);
  console.log(`  - Asset No: ${asset?.asset_no}`);
  console.log(``);

  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const allDeleted =
    customer?.is_delete === true &&
    site?.is_delete === true &&
    building?.is_delete === true &&
    floor?.is_delete === true &&
    asset?.is_delete === true;

  if (allDeleted) {
    console.log('✅ SUCCESS! All records have is_delete=true');
    console.log('   CASCADE DELETE WORKED PERFECTLY!');
  } else {
    console.log('❌ FAILURE! Some records do NOT have is_delete=true');
    console.log(`   Customer: ${customer?.is_delete}`);
    console.log(`   Site: ${site?.is_delete}`);
    console.log(`   Building: ${building?.is_delete}`);
    console.log(`   Floor: ${floor?.is_delete}`);
    console.log(`   Asset: ${asset?.is_delete}`);
  }

  await mongoose.disconnect();
}

verifyCascade().catch(console.error);
