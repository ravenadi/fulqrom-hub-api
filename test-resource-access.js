const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Role = require('./models/Role');

async function testResourceAccess() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    const userId = '68f75211ab9d0946c112721e';

    // Test 1: Add resource access directly to DB
    console.log('━'.repeat(70));
    console.log('TEST 1: Adding resource access directly to database');
    console.log('━'.repeat(70));

    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log('Before:', {
      email: user.email,
      resource_access_count: user.resource_access?.length || 0
    });

    // Add a test resource access entry
    user.resource_access = user.resource_access || [];
    user.resource_access.push({
      resource_type: 'building',
      resource_id: 'test-building-123',
      resource_name: 'Test Building',
      permissions: {
        can_view: true,
        can_create: false,
        can_edit: true,
        can_delete: false
      },
      granted_at: new Date(),
      granted_by: 'test-script'
    });

    await user.save();
    console.log('\n✅ Resource access added to database');

    // Verify it was saved
    const verifyUser = await User.findById(userId);
    console.log('\nAfter save:', {
      email: verifyUser.email,
      resource_access_count: verifyUser.resource_access?.length || 0,
      latest_entry: verifyUser.resource_access[verifyUser.resource_access.length - 1]
    });

    console.log('\n' + '━'.repeat(70));
    console.log('TEST 2: Verifying resource_access field structure');
    console.log('━'.repeat(70));

    if (verifyUser.resource_access && verifyUser.resource_access.length > 0) {
      const lastEntry = verifyUser.resource_access[verifyUser.resource_access.length - 1];
      console.log('\nLast entry details:');
      console.log('  _id:', lastEntry._id);
      console.log('  resource_type:', lastEntry.resource_type);
      console.log('  resource_id:', lastEntry.resource_id);
      console.log('  resource_name:', lastEntry.resource_name);
      console.log('  permissions:', lastEntry.permissions);
      console.log('  granted_at:', lastEntry.granted_at);
      console.log('  granted_by:', lastEntry.granted_by);
      console.log('\n✅ Database storage is working correctly!');
    }

    console.log('\n' + '━'.repeat(70));
    console.log('CONCLUSION');
    console.log('━'.repeat(70));
    console.log('Database can store resource_access entries ✅');
    console.log('Issue must be in API endpoint or frontend 🔍');
    console.log('Next: Test API endpoint with curl or Postman\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testResourceAccess();
