/**
 * Script to update user's hierarchical permissions flag
 *
 * Usage:
 * node scripts/update-user-hierarchical-flag.js <email> <true|false>
 *
 * Examples:
 * node scripts/update-user-hierarchical-flag.js dev+cont@user.com false
 * node scripts/update-user-hierarchical-flag.js admin@example.com true
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function updateUserHierarchicalFlag(email, useHierarchical) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`\n📋 Current User Details:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.full_name}`);
    console.log(`   Current hierarchical setting: ${user.use_hierarchical_permissions !== false ? 'ENABLED (hierarchical)' : 'DISABLED (strict)'}`);

    // Update the flag
    user.use_hierarchical_permissions = useHierarchical;
    await user.save();

    console.log(`\n✅ Updated hierarchical permissions flag to: ${useHierarchical ? 'ENABLED (hierarchical)' : 'DISABLED (strict)'}`);

    if (useHierarchical) {
      console.log(`\n📚 Hierarchical Mode Enabled:`);
      console.log(`   ✓ Customer access → See all sites, buildings, floors, assets under that customer`);
      console.log(`   ✓ Site access → See all buildings, floors, assets under that site`);
      console.log(`   ✓ Building access → See all floors, assets under that building`);
    } else {
      console.log(`\n🔒 Strict Mode Enabled:`);
      console.log(`   ✓ Only see explicitly assigned resources`);
      console.log(`   ✓ No automatic expansion from parent resources`);
      console.log(`   ✓ More restrictive access control`);
    }

    console.log(`\n💡 Test by logging in as: ${user.email}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error('❌ Usage: node scripts/update-user-hierarchical-flag.js <email> <true|false>');
  console.error('\nExamples:');
  console.error('  node scripts/update-user-hierarchical-flag.js dev+cont@user.com false');
  console.error('  node scripts/update-user-hierarchical-flag.js admin@example.com true');
  process.exit(1);
}

const email = args[0];
const useHierarchical = args[1].toLowerCase() === 'true';

// Run the update
updateUserHierarchicalFlag(email, useHierarchical);
