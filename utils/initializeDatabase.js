const Role = require('../models/Role');

/**
 * Initialize database with predefined roles
 * This runs once on server startup
 */
async function initializeDatabase() {
  try {
    // Initialize predefined roles using the v2 schema
    await Role.initializePredefinedRoles();
    console.log('✓ Predefined roles initialized');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    // Continue on error - don't block server startup
  }
}

module.exports = initializeDatabase;
