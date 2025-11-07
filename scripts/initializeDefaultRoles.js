const mongoose = require('mongoose');
const Role = require('../models/Role');

// Permission matrix based on the PERMISSION_MATRIX.md (excluding org module)
const ROLE_PERMISSIONS = {
  'Admin': {
    sites: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    buildings: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    floors: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    tenants: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    documents: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    assets: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    vendors: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    customers: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    users: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    analytics: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    audit_logs: { can_view: true, can_create: true, can_edit: true, can_delete: true }
  },
  'Property Manager': {
    sites: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    buildings: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    floors: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    tenants: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    documents: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    assets: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    vendors: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    customers: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    users: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    analytics: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    audit_logs: { can_view: true, can_create: true, can_edit: true, can_delete: true }
  },
  'Building Manager': {
    sites: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    buildings: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    floors: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    tenants: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    documents: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    assets: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    vendors: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    customers: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    users: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    analytics: { can_view: true, can_create: true, can_edit: false, can_delete: false },
    audit_logs: { can_view: true, can_create: false, can_edit: false, can_delete: false }
  },
  'Contractor': {
    sites: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    buildings: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    floors: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    tenants: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    documents: { can_view: true, can_create: true, can_edit: false, can_delete: false },
    assets: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    vendors: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    customers: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    users: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    analytics: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    audit_logs: { can_view: true, can_create: false, can_edit: false, can_delete: false }
  },
  'Tenants': {
    sites: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    buildings: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    floors: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    tenants: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    documents: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    assets: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    vendors: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    customers: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    users: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    analytics: { can_view: false, can_create: false, can_edit: false, can_delete: false },
    audit_logs: { can_view: false, can_create: false, can_edit: false, can_delete: false }
  }
};

async function initializeDefaultRoles() {
  try {
    console.log('Starting default roles initialization...');

    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      // Check if role already exists
      const existingRole = await Role.findOne({ name: roleName });
      
      if (existingRole) {
        console.log(`Role '${roleName}' already exists, updating permissions...`);
        
        // Update permissions
        const permissionArray = Object.entries(permissions).map(([module_name, perms]) => ({
          module_name,
          ...perms
        }));
        
        existingRole.permissions = permissionArray;
        await existingRole.save();
        console.log(`Updated role '${roleName}' with new permissions`);
      } else {
        console.log(`Creating new role '${roleName}'...`);
        
        // Create permission array
        const permissionArray = Object.entries(permissions).map(([module_name, perms]) => ({
          module_name,
          ...perms
        }));
        
        const newRole = new Role({
          name: roleName,
          description: `Default ${roleName} role with predefined permissions`,
          is_active: true,
          permissions: permissionArray
        });
        
        await newRole.save();
        console.log(`Created role '${roleName}' successfully`);
      }
    }

    console.log('Default roles initialization completed successfully!');
    
    // Display summary
    const allRoles = await Role.find({}).sort({ name: 1 });
    console.log('\nCurrent roles in database:');
    allRoles.forEach(role => {
      console.log(`- ${role.name}: ${role.permissions.length} permissions`);
    });

  } catch (error) {
    console.error('Error initializing default roles:', error);
    throw error;
  }
}

// Export for use in other scripts
module.exports = { initializeDefaultRoles, ROLE_PERMISSIONS };

// Run if called directly
if (require.main === module) {
  // Connect to MongoDB
  const MONGODB_URI = process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom_hub';
  
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB');
      return initializeDefaultRoles();
    })
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}
