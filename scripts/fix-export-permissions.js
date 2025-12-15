/**
 * Fix Export Permissions Script
 *
 * Sets proper export permission values for all existing roles
 * Run: node scripts/fix-export-permissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');

const MONGODB_URI = process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub';

async function fixExportPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📋 Fetching all roles...');
    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles\n`);

    let updatedCount = 0;

    for (const role of roles) {
      console.log(`\n🔍 Processing role: ${role.name}`);

      let exportLogic = '';

      // Define export permission logic based on role
      const updatedPermissions = role.permissions.map(permission => {
        let exportPermission = false;

        if (role.name === 'Admin' || role.name === 'super_admin') {
          // Admin gets export for all modules
          exportPermission = true;
          exportLogic = 'Admin - export all';
        } else if (role.name === 'Property Manager') {
          // Property Manager gets export for all modules
          exportPermission = true;
          exportLogic = 'Property Manager - export all';
        } else if (role.name === 'Building Manager') {
          // Building Manager: export enabled for modules they can view/edit
          exportPermission = permission.view;
          exportLogic = 'Building Manager - export if can view';
        } else if (role.name === 'Contractor') {
          // Contractor: only export documents
          exportPermission = permission.entity === 'documents' && permission.view;
          exportLogic = 'Contractor - documents only';
        } else if (role.name === 'Tenants') {
          // Tenants: only export documents
          exportPermission = permission.entity === 'documents' && permission.view;
          exportLogic = 'Tenants - documents only';
        } else {
          // Guest or other roles: no export
          exportPermission = false;
          exportLogic = 'Guest/Other - no export';
        }

        return {
          entity: permission.entity,
          view: permission.view,
          create: permission.create,
          edit: permission.edit,
          delete: permission.delete,
          export: exportPermission
        };
      });

      role.permissions = updatedPermissions;
      await role.save();

      console.log(`   ✅ Updated (${exportLogic})`);
      console.log(`   📊 Export permissions: ${updatedPermissions.filter(p => p.export).map(p => p.entity).join(', ') || 'none'}`);
      updatedCount++;
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Total roles processed: ${roles.length}`);
    console.log(`   Roles updated: ${updatedCount}`);
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
fixExportPermissions();
