require('dotenv').config();
const mongoose = require('mongoose');
const RoleV2 = require('../models/v2/Role');

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub';

/**
 * Initialize RoleV2 collection with predefined roles based on the permissions matrix
 */
async function initializeRoleV2Data() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Database connected successfully');

    // Clear existing RoleV2 data
    console.log('🗑️  Clearing existing RoleV2 data...');
    await RoleV2.deleteMany({});
    console.log('✅ Existing RoleV2 data cleared');

    // Get predefined roles from the model's static method
    const predefinedRoles = RoleV2.getPredefinedRoles().map(role => ({
      ...role,
      is_active: true
    }));

    console.log('📝 Creating predefined roles...');
    
    // Insert roles one by one to handle any potential errors
    for (const roleData of predefinedRoles) {
      try {
        const role = new RoleV2(roleData);
        await role.save();
        console.log(`✅ Created role: ${roleData.name}`);
      } catch (error) {
        console.error(`❌ Error creating role ${roleData.name}:`, error.message);
      }
    }

    // Verify the data was inserted
    const roleCount = await RoleV2.countDocuments();
    console.log(`📊 Total roles created: ${roleCount}`);

    // Display summary
    const roles = await RoleV2.find({}, 'name description permissions').lean();
    console.log('\n📋 Role Summary:');
    roles.forEach(role => {
      console.log(`\n${role.name}:`);
      console.log(`  Description: ${role.description}`);
      console.log(`  Permissions:`);
      role.permissions.forEach(perm => {
        const actions = [];
        if (perm.view) actions.push('View');
        if (perm.create) actions.push('Create');
        if (perm.edit) actions.push('Edit');
        if (perm.delete) actions.push('Delete');
        console.log(`    ${perm.entity}: ${actions.join(', ') || 'None'}`);
      });
    });

    console.log('\n🎉 RoleV2 initialization completed successfully!');

  } catch (error) {
    console.error('❌ Error initializing RoleV2 data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the initialization
if (require.main === module) {
  initializeRoleV2Data();
}

module.exports = initializeRoleV2Data;
