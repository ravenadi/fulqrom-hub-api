const Role = require('../models/Role');
const User = require('../models/User');

/**
 * Initialize database with default role and user
 * This runs once on server startup
 */
async function initializeDatabase() {
  try {
    let siteManagerRole = await Role.findOne({ name: 'Site Manager' });

    if (!siteManagerRole) {
      siteManagerRole = new Role({
        name: 'Site Manager',
        description: 'Default role for site management with full access',
        is_active: true,
        permissions: [
          { module_name: 'customers', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'sites', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'buildings', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'floors', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'assets', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'tenants', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'documents', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'vendors', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'users', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { module_name: 'roles', can_view: true, can_create: true, can_edit: true, can_delete: true }
        ]
      });

      await siteManagerRole.save();
    }

    let demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });

    if (!demoUser) {
      demoUser = new User({
        email: 'demo@fulqrom.com.au',
        full_name: 'Demo User',
        phone: '+61 2 9000 0000',
        is_active: true,
        role_ids: [siteManagerRole._id]
      });

      await demoUser.save();
    }

  } catch (error) {
    // Continue on error - don't block server startup
  }
}

module.exports = initializeDatabase;
