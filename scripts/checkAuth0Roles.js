/**
 * Script to check what roles exist in Auth0 and create missing ones
 * 
 * Usage: node scripts/checkAuth0Roles.js
 */

const mongoose = require('mongoose');
const RoleV2 = require('../models/v2/Role');
const { getAuth0RoleByName, createAuth0Role } = require('../services/auth0Service');

// Load environment variables
require('dotenv').config();

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function checkAuth0Roles() {
  try {
    console.log('🔍 Checking Auth0 roles...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all MongoDB roles
    console.log('📋 Fetching MongoDB roles...');
    const mongoRoles = await RoleV2.find({}).lean();
    console.log(`📊 Found ${mongoRoles.length} MongoDB roles`);

    let existingCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    for (const role of mongoRoles) {
      console.log(`\n🔍 Checking role: ${role.name}`);
      
      try {
        // Check if Auth0 role exists
        const auth0Role = await getAuth0RoleByName(role.name);
        
        if (auth0Role) {
          console.log(`✅ Auth0 role exists: ${role.name} (${auth0Role.id})`);
          existingCount++;
        } else {
          console.log(`❌ Auth0 role missing: ${role.name}`);
          console.log(`🆕 Creating Auth0 role: ${role.name}`);
          
          try {
            const newAuth0Role = await createAuth0Role({
              name: role.name,
              description: role.description || `Role: ${role.name}`
            });
            
            console.log(`✅ Created Auth0 role: ${role.name} (${newAuth0Role.id})`);
            createdCount++;
          } catch (createError) {
            if (createError.message.includes('already exists') || createError.message.includes('409')) {
              console.log(`✅ Auth0 role already exists: ${role.name}`);
              existingCount++;
            } else {
              console.error(`❌ Failed to create Auth0 role "${role.name}":`, createError.message);
              errorCount++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error checking role "${role.name}":`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Roles already existed: ${existingCount}`);
    console.log(`🆕 Roles created: ${createdCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total processed: ${mongoRoles.length}`);

    if (errorCount === 0) {
      console.log('\n🎉 All roles are now synchronized with Auth0!');
    } else {
      console.log(`\n⚠️ Completed with ${errorCount} errors.`);
    }

  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkAuth0Roles().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
