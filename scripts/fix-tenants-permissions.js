/**
 * Fix Tenants role permissions in the database
 * This updates the existing "Tenants" role to have view permissions
 */

const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

async function fixTenantsPermissions() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_CONNECTION;
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Find the Tenants role
    const tenantsRole = await Role.findOne({ name: 'Tenants' });
    
    if (!tenantsRole) {
      console.error('❌ Tenants role not found');
      process.exit(1);
    }

    console.log('📋 Current Tenants role permissions:');
    tenantsRole.permissions.forEach(p => {
      console.log(`  - ${p.entity}: view=${p.view}, create=${p.create}, edit=${p.edit}, delete=${p.delete}`);
    });

    // Update permissions to give basic view access
    const updatedPermissions = [
      { entity: 'sites', view: true, create: false, edit: false, delete: false },
      { entity: 'buildings', view: true, create: false, edit: false, delete: false },
      { entity: 'floors', view: true, create: false, edit: false, delete: false },
      { entity: 'documents', view: true, create: false, edit: false, delete: false },
      { entity: 'assets', view: true, create: false, edit: false, delete: false },
      { entity: 'vendors', view: false, create: false, edit: false, delete: false },
      { entity: 'customers', view: false, create: false, edit: false, delete: false },
      { entity: 'users', view: false, create: false, edit: false, delete: false },
      { entity: 'analytics', view: true, create: false, edit: false, delete: false },
      { entity: 'tenants', view: false, create: false, edit: false, delete: false }
    ];

    // Update the role
    tenantsRole.permissions = updatedPermissions;
    tenantsRole.updated_at = new Date();
    await tenantsRole.save();

    console.log('\n✅ Tenants role updated successfully!');
    console.log('\n📋 New Tenants role permissions:');
    tenantsRole.permissions.forEach(p => {
      if (p.view) {
        console.log(`  ✅ ${p.entity}: view=true`);
      }
    });

    console.log('\n💡 Next steps:');
    console.log('  1. Have the tenant user log out and log back in');
    console.log('  2. Permissions will be refreshed from the database');
    console.log('  3. Toaster spam should stop');

    // Close connection
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error updating Tenants role:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
fixTenantsPermissions();

