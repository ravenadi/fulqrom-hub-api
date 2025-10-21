/**
 * Verify Multi-Tenancy Migration
 *
 * This script verifies that all tenant-scoped collections have tenant_id
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Organization = require('../models/Organization');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const Document = require('../models/Document');
const Role = require('../models/Role');

const COLLECTIONS = [
  { name: 'Organization', model: Organization },
  { name: 'Customer', model: Customer },
  { name: 'User', model: User },
  { name: 'Site', model: Site },
  { name: 'Building', model: Building },
  { name: 'Floor', model: Floor },
  { name: 'Asset', model: Asset },
  { name: 'BuildingTenant', model: BuildingTenant },
  { name: 'Vendor', model: Vendor },
  { name: 'Document', model: Document },
  { name: 'Role', model: Role }
];

async function verify() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║          Multi-Tenancy Migration Verification          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);

    let allValid = true;
    const results = [];

    for (const { name, model } of COLLECTIONS) {
      const total = await model.countDocuments({});
      const withTenant = await model.countDocuments({ tenant_id: { $exists: true } });
      const withoutTenant = total - withTenant;

      const status = withoutTenant === 0 ? '✓' : '❌';
      const statusText = withoutTenant === 0 ? 'PASS' : 'FAIL';

      results.push({
        name,
        total,
        withTenant,
        withoutTenant,
        status: statusText
      });

      console.log(`${status} ${name.padEnd(20)} ${withTenant}/${total} records with tenant_id`);

      if (withoutTenant > 0) {
        allValid = false;
      }
    }

    console.log('\n' + '═'.repeat(60));

    if (allValid) {
      console.log('\n✅ MIGRATION SUCCESSFUL!');
      console.log('All tenant-scoped collections have tenant_id on all records.\n');
    } else {
      console.log('\n⚠️  MIGRATION INCOMPLETE');
      console.log('Some collections still have records without tenant_id.\n');
    }

    // Summary
    const totalRecords = results.reduce((sum, r) => sum + r.total, 0);
    const totalWithTenant = results.reduce((sum, r) => sum + r.withTenant, 0);

    console.log('Summary:');
    console.log(`Total records: ${totalRecords}`);
    console.log(`Records with tenant_id: ${totalWithTenant}`);
    console.log(`Coverage: ${((totalWithTenant / totalRecords) * 100).toFixed(2)}%`);

    process.exit(allValid ? 0 : 1);

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verify();
