/**
 * Script to assign Auth0 roles to existing users
 * This ensures all users with role_ids in MongoDB have corresponding Auth0 roles assigned
 * 
 * Usage: node scripts/assignAuth0RolesToUsers.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const RoleV2 = require('../models/v2/Role');
const { assignRolesToUser, getAuth0UserByEmail } = require('../services/auth0Service');

// Load environment variables
require('dotenv').config();

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function assignAuth0RolesToUsers() {
  try {
    console.log('🔄 Starting Auth0 role assignment to users...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all users with role assignments
    console.log('👥 Fetching users with role assignments...');
    const users = await User.find({ 
      role_ids: { $exists: true, $ne: [] },
      auth0_id: { $exists: true, $ne: null }
    }).lean();
    
    console.log(`📊 Found ${users.length} users with role assignments and Auth0 IDs`);

    let assignedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      console.log(`🔍 Processing user: ${user.email}`);
      
      try {
        // Check if user exists in Auth0
        const auth0User = await getAuth0UserByEmail(user.email);
        if (!auth0User) {
          console.log(`⚠️ User not found in Auth0: ${user.email}`);
          skippedCount++;
          continue;
        }

        // Assign roles to user
        const result = await assignRolesToUser(auth0User.user_id, user.role_ids);
        
        if (result.assigned > 0) {
          console.log(`✅ Assigned ${result.assigned} roles to ${user.email}`);
          assignedCount++;
        } else {
          console.log(`ℹ️ No new roles assigned to ${user.email} (${result.skipped} skipped)`);
          skippedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing user "${user.email}":`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Assignment Summary:');
    console.log(`✅ Users with roles assigned: ${assignedCount}`);
    console.log(`ℹ️ Users skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`👥 Total processed: ${users.length}`);

    if (errorCount === 0) {
      console.log('\n🎉 Auth0 role assignment completed successfully!');
    } else {
      console.log(`\n⚠️ Assignment completed with ${errorCount} errors.`);
    }

  } catch (error) {
    console.error('❌ Assignment failed:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

assignAuth0RolesToUsers().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
