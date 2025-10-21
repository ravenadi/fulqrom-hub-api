/**
 * Simple test to check Auth0 role assignment
 * This will test assigning roles directly to a user
 * 
 * Usage: node scripts/testSimpleRoleAssignment.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const RoleV2 = require('../models/v2/Role');
const { getAuth0RoleByName } = require('../services/auth0Service');

// Load environment variables
require('dotenv').config();

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function testSimpleRoleAssignment() {
  try {
    console.log('🧪 Testing simple Auth0 role assignment...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the specific user from your example
    const testUser = await User.findOne({ email: 'deven@gkblabs.com' });
    
    if (!testUser) {
      console.log('❌ User deven@gkblabs.com not found');
      return;
    }

    console.log(`👤 Testing with user: ${testUser.email}`);
    console.log(`🔑 Auth0 ID: ${testUser.auth0_id}`);
    console.log(`📋 Current roles: ${testUser.role_ids?.length || 0}`);

    // Get the Admin role
    const adminRole = await RoleV2.findOne({ name: 'Admin' });
    if (!adminRole) {
      console.log('❌ Admin role not found in MongoDB');
      return;
    }

    console.log(`📋 Admin role ID: ${adminRole._id}`);

    // Check if Admin role exists in Auth0
    const auth0AdminRole = await getAuth0RoleByName('Admin');
    if (!auth0AdminRole) {
      console.log('❌ Admin role not found in Auth0');
      return;
    }

    console.log(`✅ Auth0 Admin role found: ${auth0AdminRole.id}`);

    // Test direct role assignment using Auth0 Management API
    const { ManagementClient } = require('auth0');
    const management = new ManagementClient({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      scope: 'read:users create:users update:users delete:users read:roles create:roles update:roles delete:roles'
    });

    console.log(`🔄 Attempting to assign Admin role to user ${testUser.auth0_id}...`);
    
    try {
      // Try to assign the role
      await management.users.roles.assign(testUser.auth0_id, { roles: [auth0AdminRole.id] });
      console.log(`✅ Successfully assigned Admin role to user!`);
      
      // Try to get user roles to verify
      try {
        const userRoles = await management.users.roles.list(testUser.auth0_id);
        console.log(`📋 User roles after assignment:`, userRoles);
      } catch (getRolesError) {
        console.log(`⚠️ Could not verify roles:`, getRolesError.message);
      }
      
    } catch (assignError) {
      console.error(`❌ Failed to assign role:`, assignError.message);
    }

    console.log('\n🎉 Simple role assignment test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testSimpleRoleAssignment().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
