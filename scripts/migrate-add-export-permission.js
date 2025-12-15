/**
 * Migration Script: Add export permission to existing roles
 *
 * This script adds the 'export' field to all permissions in existing roles.
 * Run this once after deploying the export permission feature.
 *
 * Usage: node scripts/migrate-add-export-permission.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');

const MONGODB_URI = process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub';

async function migrateRoles() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📋 Fetching all roles...');
    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles to migrate\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const role of roles) {
      console.log(`\n🔍 Processing role: ${role.name}`);

      // Check if any permission is missing the export field
      const needsUpdate = role.permissions.some(p => p.export === undefined);

      if (!needsUpdate) {
        console.log(`   ⏭️  Skipped - already has export field`);
        skippedCount++;
        continue;
      }

      // Update permissions based on role type
      const updatedPermissions = role.permissions.map(permission => {
        // Default export permission logic:
        // - Admin & Property Manager: export = true for all modules
        // - Building Manager: export = true for modules they can view
        // - Contractor: export = true for documents only
        // - Tenants: export = true for documents only

        let exportPermission = false;

        if (role.name === 'Admin' || role.name === 'Property Manager') {
          exportPermission = true;
        } else if (role.name === 'Building Manager') {
          exportPermission = permission.view;
        } else if (role.name === 'Contractor' || role.name === 'Tenants') {
          exportPermission = permission.entity === 'documents' && permission.view;
        }

        return {
          ...permission.toObject(),
          export: exportPermission
        };
      });

      role.permissions = updatedPermissions;
      await role.save();

      console.log(`   ✅ Updated with export permissions`);
      updatedCount++;
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`   Total roles: ${roles.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log('='.repeat(50));
    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrateRoles();
