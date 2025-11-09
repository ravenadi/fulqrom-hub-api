/**
 * Remove customer resource_access from a user
 *
 * Usage:
 * node scripts/remove-customer-from-user.js <email>
 *
 * Example:
 * node scripts/remove-customer-from-user.js dev+cont@user.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function removeCustomerAccess(email) {
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

    console.log(`\n📋 User: ${user.full_name} (${user.email})`);
    console.log(`\n📦 Current resource_access:`);
    user.resource_access.forEach((access, index) => {
      console.log(`   ${index + 1}. ${access.resource_type}: ${access.resource_id}`);
    });

    // Remove customer resource_access entries
    const originalCount = user.resource_access.length;
    user.resource_access = user.resource_access.filter(
      access => access.resource_type !== 'customer'
    );

    const removedCount = originalCount - user.resource_access.length;

    if (removedCount === 0) {
      console.log(`\n✅ No customer resource_access entries found. Nothing to remove.`);
      process.exit(0);
    }

    // Save the updated user
    await user.save();

    console.log(`\n✅ Removed ${removedCount} customer resource_access entry(ies)`);
    console.log(`\n📦 Updated resource_access:`);
    user.resource_access.forEach((access, index) => {
      console.log(`   ${index + 1}. ${access.resource_type}: ${access.resource_id}`);
    });

    console.log(`\n💡 User will now only see resources they have explicit access to:`);
    console.log(`   - Sites: ${user.resource_access.filter(a => a.resource_type === 'site').length}`);
    console.log(`   - Buildings: ${user.resource_access.filter(a => a.resource_type === 'building').length}`);
    console.log(`   - Floors: ${user.resource_access.filter(a => a.resource_type === 'floor').length}`);
    console.log(`   - Assets: ${user.resource_access.filter(a => a.resource_type === 'asset').length}`);

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

if (args.length !== 1) {
  console.error('❌ Usage: node scripts/remove-customer-from-user.js <email>');
  console.error('\nExample:');
  console.error('  node scripts/remove-customer-from-user.js dev+cont@user.com');
  process.exit(1);
}

const email = args[0];

// Run the script
removeCustomerAccess(email);
