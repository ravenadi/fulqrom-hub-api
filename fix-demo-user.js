const mongoose = require('mongoose');
const Role = require('./models/Role');
const User = require('./models/User');
require('dotenv').config();

async function fixDemoUser() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB');

    // Find Admin role
    const adminRole = await Role.findOne({ name: 'Admin' });
    if (!adminRole) {
      console.log('Admin role not found, creating it...');
      await Role.initializePredefinedRoles();
      const adminRole = await Role.findOne({ name: 'Admin' });
    }

    // Find demo user
    const demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });
    if (!demoUser) {
      console.log('Demo user not found!');
      return;
    }

    // Assign Admin role to demo user
    demoUser.role_ids = [adminRole._id];
    await demoUser.save();

    console.log('✅ Demo user updated with Admin role');

    // Verify the fix
    const updatedUser = await User.findOne({ email: 'demo@fulqrom.com.au' }).populate('role_ids');
    console.log('\nUpdated Demo User:', {
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      roles: updatedUser.role_ids.map(role => role.name)
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB disconnected.');
  }
}

fixDemoUser();
