/**
 * Migration Script: Single-Tenant to Multi-Tenant
 *
 * This script migrates the existing single-tenant Fulqrom Hub database
 * to a multi-tenant architecture.
 *
 * What it does:
 * 1. Creates a default "Fulqrom Default Organization"
 * 2. Assigns all existing users to this organization
 * 3. Updates all existing records with tenant_id pointing to the default organization
 * 4. Validates that all records have been migrated
 * 5. Creates a migration report
 *
 * IMPORTANT:
 * - Take a database backup before running this script!
 * - Run this script only once
 * - Review the migration report after completion
 *
 * Usage:
 *   node scripts/migrate-to-multi-tenant.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
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

// Models that need tenant_id (excluding Organization, Plan, UserOrganization)
const TENANT_SCOPED_MODELS = [
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

// Migration report
const migrationReport = {
  startTime: new Date(),
  endTime: null,
  success: false,
  defaultOrganization: null,
  statistics: {},
  errors: [],
  warnings: []
};

/**
 * Main migration function
 */
async function migrateToMultiTenant() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Fulqrom Hub: Single-Tenant to Multi-Tenant Migration  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Check if migration has already been run
    console.log('📋 Step 1: Checking if migration has already been run...');
    const existingDefaultOrg = await Organization.findOne({ slug: 'fulqrom-default' });

    if (existingDefaultOrg) {
      console.log('⚠️  WARNING: Default organization already exists!');
      console.log('   This suggests the migration may have already been run.');
      console.log('   Organization:', existingDefaultOrg.name);
      console.log('   Created:', existingDefaultOrg.created_at);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question('\n   Continue anyway? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Migration cancelled by user.');
        process.exit(0);
      }

      migrationReport.warnings.push('Migration run on existing default organization');
    }

    // Step 2: Get or create Professional plan
    console.log('\n📋 Step 2: Setting up subscription plan...');
    let professionalPlan = await Plan.findOne({ name: /professional/i });

    if (!professionalPlan) {
      console.log('   Creating Professional plan...');
      professionalPlan = await Plan.create({
        name: 'Professional',
        description: 'Professional plan for existing customers',
        price: 0, // Free for existing customers
        billing_period: 'monthly',
        features: {
          max_users: 50,
          max_buildings: 100,
          max_sites: 50,
          storage_gb: 100
        },
        is_active: true
      });
      console.log('   ✓ Professional plan created');
    } else {
      console.log('   ✓ Professional plan found');
    }

    // Step 3: Create default organization
    console.log('\n📋 Step 3: Creating default organization...');

    let defaultOrganization;
    if (existingDefaultOrg) {
      defaultOrganization = existingDefaultOrg;
      console.log('   ✓ Using existing default organization');
    } else {
      // Find the first user to be the owner
      const firstUser = await User.findOne().sort({ created_at: 1 });

      if (!firstUser) {
        throw new Error('No users found in database. Cannot create default organization without an owner.');
      }

      defaultOrganization = await Organization.create({
        name: 'Fulqrom Default Organization',
        slug: 'fulqrom-default',
        email: firstUser.email || 'admin@fulqrom.com.au',
        plan_id: professionalPlan._id,
        status: 'active', // Set as active, not trial
        owner_id: firstUser._id,
        limits: {
          users: 50,
          buildings: 100,
          sites: 50,
          storage_gb: 100
        },
        current_usage: {
          users: 0,
          buildings: 0,
          sites: 0,
          storage_bytes: 0
        },
        is_active: true
      });

      console.log('   ✓ Default organization created');
    }

    migrationReport.defaultOrganization = {
      id: defaultOrganization._id.toString(),
      name: defaultOrganization.name,
      slug: defaultOrganization.slug
    };

    // Step 4: Update users with tenant_id
    console.log('\n📋 Step 4: Updating users with tenant_id...');
    const users = await User.find({});
    console.log(`   Found ${users.length} users`);

    let usersUpdated = 0;
    for (const user of users) {
      if (!user.tenant_id) {
        await User.findByIdAndUpdate(user._id, { tenant_id: defaultOrganization._id });
        usersUpdated++;
      }
    }

    console.log(`   ✓ ${usersUpdated} users updated with tenant_id`);
    migrationReport.statistics.usersUpdated = usersUpdated;

    // Step 5: Update all tenant-scoped collections
    console.log('\n📋 Step 5: Adding tenant_id to all records...');

    for (const { name, model, collection } of TENANT_SCOPED_MODELS) {
      console.log(`\n   Processing ${name}...`);

      try {
        // Count total records
        const totalCount = await model.countDocuments({});
        console.log(`     Total records: ${totalCount}`);

        if (totalCount === 0) {
          console.log(`     ⊘ No records to migrate`);
          migrationReport.statistics[name] = { total: 0, migrated: 0, skipped: 0 };
          continue;
        }

        // Count records without tenant_id
        const unmigrated = await model.countDocuments({ tenant_id: { $exists: false } });
        console.log(`     Records without tenant_id: ${unmigrated}`);

        if (unmigrated === 0) {
          console.log(`     ✓ All records already have tenant_id`);
          migrationReport.statistics[name] = { total: totalCount, migrated: 0, skipped: totalCount };
          continue;
        }

        // Update records without tenant_id
        const result = await model.updateMany(
          { tenant_id: { $exists: false } },
          { $set: { tenant_id: defaultOrganization._id } }
        );

        console.log(`     ✓ Updated ${result.modifiedCount} records`);
        migrationReport.statistics[name] = {
          total: totalCount,
          migrated: result.modifiedCount,
          skipped: totalCount - result.modifiedCount
        };

        // Verify all records now have tenant_id
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

    // Step 6: Update organization usage counts
    console.log('\n📋 Step 6: Updating organization usage statistics...');

    const usageUpdates = {
      users: await User.countDocuments({ tenant_id: defaultOrganization._id }),
      buildings: await Building.countDocuments({ tenant_id: defaultOrganization._id }),
      sites: await Site.countDocuments({ tenant_id: defaultOrganization._id }),
      storage_bytes: 0 // TODO: Calculate actual storage
    };

    await Organization.findByIdAndUpdate(
      defaultOrganization._id,
      { $set: { current_usage: usageUpdates } }
    );

    console.log('   ✓ Usage statistics updated');
    console.log(`     Users: ${usageUpdates.users}`);
    console.log(`     Buildings: ${usageUpdates.buildings}`);
    console.log(`     Sites: ${usageUpdates.sites}`);

    migrationReport.statistics.organizationUsage = usageUpdates;

    // Step 7: Final validation
    console.log('\n📋 Step 7: Validating migration...');
    let validationPassed = true;

    for (const { name, model } of TENANT_SCOPED_MODELS) {
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
      console.log('\n   ✓ Validation passed! All records have tenant_id');
      migrationReport.success = true;
    } else {
      console.log('\n   ⚠️  Validation warnings found. Check the migration report.');
      migrationReport.success = false;
    }

    // Step 8: Generate migration report
    migrationReport.endTime = new Date();
    const duration = (migrationReport.endTime - migrationReport.startTime) / 1000;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║              Migration Complete!                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Status: ${migrationReport.success ? '✓ SUCCESS' : '⚠️  COMPLETED WITH WARNINGS'}`);

    // Save report to file
    const reportPath = path.join(__dirname, `migration-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(migrationReport, null, 2));
    console.log(`\nMigration report saved to: ${reportPath}`);

    // Display summary
    console.log('\n📊 Migration Summary:');
    console.log('─────────────────────');
    console.log(`Default Organization: ${defaultOrganization.name}`);
    console.log(`Organization ID: ${defaultOrganization._id}`);
    console.log(`Users Updated: ${migrationReport.statistics.usersUpdated || 0}`);

    console.log('\nRecords Migrated:');
    for (const [modelName, stats] of Object.entries(migrationReport.statistics)) {
      if (modelName !== 'usersUpdated' && modelName !== 'organizationUsage' && stats.total) {
        console.log(`  ${modelName}: ${stats.migrated}/${stats.total}`);
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

    console.log('\n✅ Next Steps:');
    console.log('  1. Review the migration report');
    console.log('  2. Test the application with the new multi-tenant structure');
    console.log('  3. Apply the tenant plugin to all models');
    console.log('  4. Update API routes to use tenant context middleware');
    console.log('  5. Deploy the multi-tenant changes\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    migrationReport.success = false;
    migrationReport.errors.push(`Fatal error: ${error.message}`);
    migrationReport.endTime = new Date();

    // Save error report
    const reportPath = path.join(__dirname, `migration-error-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(migrationReport, null, 2));
    console.log(`Error report saved to: ${reportPath}`);

    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_CONNECTION or MONGODB_URI environment variable not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  console.log(`Database: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`); // Hide credentials

  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✓ Connected to MongoDB\n');
      return migrateToMultiTenant();
    })
    .then(() => {
      console.log('\n🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToMultiTenant };
