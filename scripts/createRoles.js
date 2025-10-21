const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

async function createRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB');

    // Delete existing roles first
    await Role.deleteMany({});
    console.log('Deleted existing roles');

    // Create Admin role
    const adminRole = new Role({
      name: 'Admin',
      description: 'Full platform access with administrative privileges across all modules and resources.',
      is_active: true,
      permissions: [
        { module_name: 'org', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'sites', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'buildings', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'floors', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'tenants', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'documents', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'assets', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'vendors', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'customers', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'users', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'analytics', can_view: true, can_create: true, can_edit: true, can_delete: true },
      ],
    });
    await adminRole.save();
    console.log('Created Admin role');

    // Create Property Manager role
    const propertyManagerRole = new Role({
      name: 'Property Manager',
      description: 'Manages properties, sites, buildings, and tenants. Can create/edit most entities.',
      is_active: true,
      permissions: [
        { module_name: 'org', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'sites', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'buildings', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'floors', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'tenants', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'documents', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'assets', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'vendors', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'customers', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'users', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'analytics', can_view: true, can_create: false, can_edit: false, can_delete: false },
      ],
    });
    await propertyManagerRole.save();
    console.log('Created Property Manager role');

    // Create Building Manager role
    const buildingManagerRole = new Role({
      name: 'Building Manager',
      description: 'Manages a specific building and its assets, maintenance, and compliance.',
      is_active: true,
      permissions: [
        { module_name: 'org', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'sites', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'buildings', can_view: true, can_create: false, can_edit: true, can_delete: false },
        { module_name: 'floors', can_view: true, can_create: true, can_edit: true, can_delete: false },
        { module_name: 'tenants', can_view: true, can_create: true, can_edit: true, can_delete: false },
        { module_name: 'documents', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'assets', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { module_name: 'vendors', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'customers', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'users', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'analytics', can_view: true, can_create: false, can_edit: false, can_delete: false },
      ],
    });
    await buildingManagerRole.save();
    console.log('Created Building Manager role');

    // Create Contractor role
    const contractorRole = new Role({
      name: 'Contractor',
      description: 'Limited access to assigned assets and work orders for maintenance tasks.',
      is_active: true,
      permissions: [
        { module_name: 'org', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'sites', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'buildings', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'floors', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'tenants', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'documents', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'assets', can_view: true, can_create: false, can_edit: true, can_delete: false },
        { module_name: 'vendors', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'customers', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'users', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'analytics', can_view: false, can_create: false, can_edit: false, can_delete: false },
      ],
    });
    await contractorRole.save();
    console.log('Created Contractor role');

    // Create Tenants role
    const tenantsRole = new Role({
      name: 'Tenants',
      description: 'View-only access to their specific tenancy documents and building information.',
      is_active: true,
      permissions: [
        { module_name: 'org', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'sites', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'buildings', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'floors', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'tenants', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'documents', can_view: true, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'assets', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'vendors', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'customers', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'users', can_view: false, can_create: false, can_edit: false, can_delete: false },
        { module_name: 'analytics', can_view: false, can_create: false, can_edit: false, can_delete: false },
      ],
    });
    await tenantsRole.save();
    console.log('Created Tenants role');

    console.log('All roles created successfully!');

    // Verify
    const allRoles = await Role.find({});
    console.log('\nRoles in database:');
    allRoles.forEach(role => {
      console.log(`- ${role.name}: ${role.permissions.length} permissions`);
    });

  } catch (error) {
    console.error('Error creating roles:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

createRoles();
