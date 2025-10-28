/**
 * Script to update Tenants role with basic view permissions
 * This will give tenants the ability to view their own building resources
 */

const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

async function updateTenantsRolePermissions() {
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

    console.log('Current Tenants role permissions:', JSON.stringify(tenantsRole.permissions, null, 2));

    // Update permissions to give basic view access to relevant resources
    // Tenants should be able to view:
    // - Sites (view only)
    // - Buildings (view only)
    // - Floors (view only - already has this)
    // - Documents (view only)
    // - Assets (view only)
    // - Analytics/Dashboard (view only)
    
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
    await tenantsRole.save();

    console.log('✅ Tenants role updated successfully!');
    console.log('New permissions:', JSON.stringify(tenantsRole.permissions, null, 2));

    // Close connection
    await mongoose.connection.close();
    console.log('✓ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error updating Tenants role:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
updateTenantsRolePermissions();

