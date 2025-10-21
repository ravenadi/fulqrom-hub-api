const mongoose = require('mongoose');
const Role = require('./models/Role');
const User = require('./models/User');
require('dotenv').config();

async function checkRole() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB');

    // Check what role corresponds to the ID
    const roleId = '68f29f40c5803c91425a1242';
    const role = await Role.findById(roleId);
    
    if (role) {
      console.log('Role found:', {
        id: role._id,
        name: role.name,
        description: role.description
      });
    } else {
      console.log('Role not found for ID:', roleId);
    }

    // Check demo user's roles
    const demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' }).populate('role_ids');
    if (demoUser) {
      console.log('\nDemo user roles:', {
        email: demoUser.email,
        role_ids: demoUser.role_ids.map(role => ({
          id: role._id,
          name: role.name
        }))
      });
    }

    // List all available roles
    const allRoles = await Role.find({});
    console.log('\nAll available roles:');
    allRoles.forEach(role => {
      console.log(`- ${role.name} (ID: ${role._id})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB disconnected.');
  }
}

checkRole();
