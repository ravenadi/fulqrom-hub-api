/**
 * Script to initialize Auth0 roles for existing MongoDB roles
 * This ensures all MongoDB roles have corresponding Auth0 roles
 * 
 * Usage: node scripts/initializeAuth0Roles.js
 */

const mongoose = require('mongoose');
const RoleV2 = require('../models/v2/Role');
const { createAuth0Role, getAuth0RoleByName } = require('../services/auth0Service');

// Load environment variables
require('dotenv').config();

// Database connection
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function initializeAuth0Roles() {
  try {
    console.log('🔄 Starting Auth0 roles initialization...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all MongoDB roles
    console.log('📋 Fetching MongoDB roles...');
    const mongoRoles = await RoleV2.find({}).lean();
    console.log(`📊 Found ${mongoRoles.length} MongoDB roles`);

    let createdCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const role of mongoRoles) {
      console.log(`🔍 Processing role: ${role.name}`);
      
      try {
        // Check if Auth0 role already exists
        const existingAuth0Role = await getAuth0RoleByName(role.name);
        
        if (existingAuth0Role) {
          console.log(`✅ Auth0 role already exists: ${role.name} (${existingAuth0Role.id})`);
          existingCount++;
        } else {
          // Create Auth0 role
          console.log(`🆕 Creating Auth0 role: ${role.name}`);
          try {
            const auth0Role = await createAuth0Role({
              name: role.name,
              description: role.description || `Role: ${role.name}`
            });
            
            console.log(`✅ Created Auth0 role: ${role.name} (${auth0Role.id})`);
            createdCount++;
          } catch (createError) {
            if (createError.message.includes('already exists') || createError.message.includes('409')) {
              console.log(`✅ Auth0 role already exists: ${role.name}`);
              existingCount++;
            } else {
              throw createError;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing role "${role.name}":`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Initialization Summary:');
    console.log(`✅ Roles already existed: ${existingCount}`);
    console.log(`🆕 Roles created: ${createdCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total processed: ${mongoRoles.length}`);

    if (errorCount === 0) {
      console.log('\n🎉 Auth0 roles initialization completed successfully!');
    } else {
      console.log(`\n⚠️ Initialization completed with ${errorCount} errors.`);
    }

  } catch (error) {
    console.error('❌ Initialization failed:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

initializeAuth0Roles().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
