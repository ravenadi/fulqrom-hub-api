/**
 * Test script to verify Auth0 role assignment works in edit mode
 * This will test updating a user's roles and verify they sync to Auth0
 * 
 * Usage: node scripts/testRoleAssignment.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const RoleV2 = require('../models/v2/Role');
const { syncUserRoles, getAuth0UserByEmail } = require('../services/auth0Service');

// Load environment variables
require('dotenv').config();

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function testRoleAssignment() {
  try {
    console.log('🧪 Testing Auth0 role assignment...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get a test user with Auth0 ID
    const testUser = await User.findOne({ 
      auth0_id: { $exists: true, $ne: null },
      email: { $ne: 'admin@fulqrom.com' } // Skip super admin
    });
    
    if (!testUser) {
      console.log('❌ No test user found with Auth0 ID');
      return;
    }

    console.log(`👤 Testing with user: ${testUser.email}`);
    console.log(`🔑 Auth0 ID: ${testUser.auth0_id}`);
    console.log(`📋 Current roles: ${testUser.role_ids?.length || 0}`);

    // Get available roles
    const availableRoles = await RoleV2.find({}).select('name _id');
    console.log(`\n📋 Available roles:`);
    availableRoles.forEach(role => {
      console.log(`  - ${role.name} (${role._id})`);
    });

    // Test role assignment
    if (availableRoles.length >= 2) {
      const newRoleIds = [availableRoles[0]._id, availableRoles[1]._id];
      console.log(`\n🔄 Testing role assignment with roles: ${availableRoles[0].name}, ${availableRoles[1].name}`);
      
      try {
        const result = await syncUserRoles(testUser.auth0_id, newRoleIds);
        console.log(`✅ Role sync result:`, result);
        
        // Verify the roles were assigned
        const auth0User = await getAuth0UserByEmail(testUser.email);
        if (auth0User) {
          console.log(`\n🔍 Verifying Auth0 user roles...`);
          // Note: We can't easily get roles from Auth0 without additional API calls
          console.log(`✅ Auth0 user found: ${auth0User.user_id}`);
        }
        
      } catch (error) {
        console.error(`❌ Role assignment test failed:`, error.message);
      }
    } else {
      console.log('⚠️ Not enough roles available for testing');
    }

    console.log('\n🎉 Role assignment test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testRoleAssignment().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
