const Role = require('../models/Role');
const User = require('../models/User');

/**
 * Initialize database with default role and user
 * This runs once on server startup
 */
async function initializeDatabase() {
  try {
    console.log('Initializing database with default data...');

    // Create Site Manager role if it doesn't exist
    let siteManagerRole = await Role.findOne({ name: 'Site Manager' });

    if (!siteManagerRole) {
      console.log('Creating Site Manager role...');

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
      console.log('✓ Site Manager role created');
    } else {
      console.log('✓ Site Manager role already exists');
    }

    // Create demo user if it doesn't exist
    let demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });

    if (!demoUser) {
      console.log('Creating demo user...');

      demoUser = new User({
        email: 'demo@fulqrom.com.au',
        full_name: 'Demo User',
        phone: '+61 2 9000 0000',
        is_active: true,
        role_ids: [siteManagerRole._id]
      });

      await demoUser.save();
      console.log('✓ Demo user created (demo@fulqrom.com.au)');
    } else {
      console.log('✓ Demo user already exists');
    }

    console.log('✅ Database initialization complete\n');

  } catch (error) {
    console.error('❌ Database initialization error:', error);
    // Don't throw - let the server continue even if initialization fails
  }
}

module.exports = initializeDatabase;
