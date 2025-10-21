const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function assignRolesToUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected for role assignment.');

    // Get the Admin role
    const adminRole = await Role.findOne({ name: 'Admin' });
    if (!adminRole) {
      console.error('Admin role not found!');
      return;
    }

    console.log('Found Admin role:', adminRole._id);

    // List of emails that should get Admin role
    const adminEmails = [
      'admin@fulqrom.com',
      'deven@gkblabs.com',
      'mchetan@gkblabs.com',
      'sdeven@gkblabs.com'
    ];

    // Assign Admin role to specified users
    for (const email of adminEmails) {
      const user = await User.findOne({ email: email });
      if (user) {
        // Check if user already has Admin role
        const hasAdminRole = user.role_ids.some(roleId => roleId.toString() === adminRole._id.toString());
        
        if (!hasAdminRole) {
          user.role_ids.push(adminRole._id);
          await user.save();
          console.log(`✅ Assigned Admin role to: ${email}`);
        } else {
          console.log(`ℹ️  User ${email} already has Admin role`);
        }
      } else {
        console.log(`❌ User not found: ${email}`);
      }
    }

    // Assign Property Manager role to other users
    const propertyManagerRole = await Role.findOne({ name: 'Property Manager' });
    if (propertyManagerRole) {
      const propertyManagerEmails = [
        'demo@fulqrom.com.au',
        'adi@theravenlabs.com',
        'adi.raven@amsga.com.au',
        'shriramsoft@gmail.com',
        'adi@ravenlabs.com.au',
        'tenant-user@mailinator.com',
        'placementdrivesloyola@gmail.com'
      ];

      for (const email of propertyManagerEmails) {
        const user = await User.findOne({ email: email });
        if (user) {
          // Check if user already has Property Manager role
          const hasPropertyManagerRole = user.role_ids.some(roleId => roleId.toString() === propertyManagerRole._id.toString());
          
          if (!hasPropertyManagerRole) {
            user.role_ids.push(propertyManagerRole._id);
            await user.save();
            console.log(`✅ Assigned Property Manager role to: ${email}`);
          } else {
            console.log(`ℹ️  User ${email} already has Property Manager role`);
          }
        } else {
          console.log(`❌ User not found: ${email}`);
        }
      }
    }

    console.log('Role assignment completed successfully!');

    // Verify assignments
    console.log('\n=== Verification ===');
    const users = await User.find().populate('role_ids').lean();
    users.forEach(user => {
      console.log(`${user.email}: ${user.role_ids?.map(r => r.name).join(', ') || 'No roles'}`);
    });

  } catch (error) {
    console.error('Error assigning roles:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

assignRolesToUsers();
