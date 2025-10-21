/**
 * Migration Script: Add tenant_id to all tables
 *
 * This script adds tenant_id field to all collections that need multi-tenancy.
 *
 * Data Model:
 * 1. Tenant (master table) - Main tenant/customer
 * 2. BuildingTenant - Office spaces/lessees in buildings
 * 3. Organization - SaaS subscription details for a tenant
 *
 * Usage:
 *   node scripts/run-migration.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Tenant = require('../models/Tenant');
const Organization = require('../models/Organization');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const Document = require('../models/Document');
const Role = require('../models/Role');

// Collections that need tenant_id (all except Tenant, Plan, Organization itself will have tenant_id too)
const TENANT_SCOPED_COLLECTIONS = [
  { name: 'Organization', model: Organization, collection: 'organizations' },
  { name: 'Customer', model: Customer, collection: 'customers' },
  { name: 'User', model: User, collection: 'users' },
  { name: 'Site', model: Site, collection: 'sites' },
  { name: 'Building', model: Building, collection: 'buildings' },
  { name: 'Floor', model: Floor, collection: 'floors' },
  { name: 'Asset', model: Asset, collection: 'assets' },
  { name: 'BuildingTenant', model: BuildingTenant, collection: 'building_tenants' },
  { name: 'Vendor', model: Vendor, collection: 'vendors' },
  { name: 'Document', model: Document, collection: 'documents' },
  { name: 'Role', model: Role, collection: 'roles' }
];

const migrationReport = {
  startTime: new Date(),
  endTime: null,
  success: false,
  defaultTenant: null,
  statistics: {},
  errors: [],
  warnings: []
};

async function runMigration() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Add tenant_id to All Tables - Migration         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Check if migration already run
    console.log('📋 Step 1: Checking for existing default tenant...');
    let defaultTenant = await Tenant.findOne({ tenant_name: /default/i }).sort({ created_at: 1 });

    if (defaultTenant) {
      console.log('✓ Found existing default tenant:', defaultTenant.tenant_name);
      migrationReport.warnings.push('Using existing default tenant');
    } else {
      // Step 2: Create default tenant
      console.log('\n📋 Step 2: Creating default tenant...');

      // Get or create plan
      let plan = await Plan.findOne({ name: /professional/i });
      if (!plan) {
        plan = await Plan.create({
          name: 'Professional',
          description: 'Professional plan',
          price: 0,
          billing_period: 'monthly',
          features: {
            max_users: 50,
            max_buildings: 100,
            max_sites: 50,
            storage_gb: 100
          },
          is_active: true
        });
        console.log('✓ Created Professional plan');
      }

      defaultTenant = await Tenant.create({
        tenant_name: 'Default Tenant',
        phone: '+61290000000',
        status: 'active',
        plan_id: plan._id
      });

      console.log('✓ Default tenant created');
    }

    migrationReport.defaultTenant = {
      id: defaultTenant._id.toString(),
      name: defaultTenant.tenant_name,
      status: defaultTenant.status
    };

    // Step 3: Add tenant_id to all collections
    console.log('\n📋 Step 3: Adding tenant_id to all collections...\n');

    for (const { name, model, collection } of TENANT_SCOPED_COLLECTIONS) {
      console.log(`   Processing ${name}...`);

      try {
        const totalCount = await model.countDocuments({});
        console.log(`     Total records: ${totalCount}`);

        if (totalCount === 0) {
          console.log(`     ⊘ No records to migrate`);
          migrationReport.statistics[name] = { total: 0, migrated: 0, skipped: 0 };
          continue;
        }

        const unmigrated = await model.countDocuments({ tenant_id: { $exists: false } });
        console.log(`     Records without tenant_id: ${unmigrated}`);

        if (unmigrated === 0) {
          console.log(`     ✓ All records already have tenant_id`);
          migrationReport.statistics[name] = { total: totalCount, migrated: 0, skipped: totalCount };
          continue;
        }

        // Update records
        const result = await model.updateMany(
          { tenant_id: { $exists: false } },
          { $set: { tenant_id: defaultTenant._id } }
        );

        console.log(`     ✓ Updated ${result.modifiedCount} records`);
        migrationReport.statistics[name] = {
          total: totalCount,
          migrated: result.modifiedCount,
          skipped: totalCount - result.modifiedCount
        };

        // Verify
        const stillUnmigrated = await model.countDocuments({ tenant_id: { $exists: false } });
        if (stillUnmigrated > 0) {
          const warning = `${name}: ${stillUnmigrated} records still without tenant_id`;
          console.log(`     ⚠️  ${warning}`);
          migrationReport.warnings.push(warning);
        }

      } catch (error) {
        const errorMsg = `Error migrating ${name}: ${error.message}`;
        console.error(`     ❌ ${errorMsg}`);
        migrationReport.errors.push(errorMsg);
      }
    }

    // Step 4: Validation
    console.log('\n📋 Step 4: Validating migration...\n');
    let validationPassed = true;

    for (const { name, model } of TENANT_SCOPED_COLLECTIONS) {
      const totalCount = await model.countDocuments({});
      if (totalCount > 0) {
        const withoutTenant = await model.countDocuments({ tenant_id: { $exists: false } });
        if (withoutTenant > 0) {
          console.log(`   ❌ ${name}: ${withoutTenant} records still missing tenant_id`);
          validationPassed = false;
        } else {
          console.log(`   ✓ ${name}: All records have tenant_id`);
        }
      }
    }

    if (validationPassed) {
      console.log('\n   ✓ Validation passed!');
      migrationReport.success = true;
    } else {
      console.log('\n   ⚠️  Validation warnings found');
      migrationReport.success = false;
    }

    // Save report
    migrationReport.endTime = new Date();
    const duration = (migrationReport.endTime - migrationReport.startTime) / 1000;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║              Migration Complete!                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Status: ${migrationReport.success ? '✓ SUCCESS' : '⚠️  COMPLETED WITH WARNINGS'}`);

    // Save report
    const reportPath = path.join(__dirname, `migration-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(migrationReport, null, 2));
    console.log(`\nReport saved: ${reportPath}`);

    // Summary
    console.log('\n📊 Summary:');
    console.log(`Default Tenant: ${defaultTenant.tenant_name} (${defaultTenant._id})`);
    console.log('\nRecords Migrated:');
    for (const [name, stats] of Object.entries(migrationReport.statistics)) {
      if (stats.total) {
        console.log(`  ${name}: ${stats.migrated}/${stats.total}`);
      }
    }

    if (migrationReport.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      migrationReport.warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (migrationReport.errors.length > 0) {
      console.log('\n❌ Errors:');
      migrationReport.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log('\n✅ Migration complete!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    migrationReport.success = false;
    migrationReport.errors.push(`Fatal: ${error.message}`);
    migrationReport.endTime = new Date();

    const reportPath = path.join(__dirname, `migration-error-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(migrationReport, null, 2));
    console.log(`Error report: ${reportPath}`);

    throw error;
  }
}

// Run
if (require.main === module) {
  const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_CONNECTION not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...\n');

  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✓ Connected to MongoDB\n');
      return runMigration();
    })
    .then(() => {
      console.log('🎉 Success!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
