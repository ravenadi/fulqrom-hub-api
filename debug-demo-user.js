const mongoose = require('mongoose');
const Role = require('./models/Role');
const User = require('./models/User');
require('dotenv').config();

async function checkDemoUser() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB');

    // Check demo user
    const demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' }).populate('role_ids');
    console.log('\nDemo User:', {
      email: demoUser?.email,
      full_name: demoUser?.full_name,
      is_active: demoUser?.is_active,
      role_ids: demoUser?.role_ids?.map(role => ({
        id: role._id,
        name: role.name,
        permissions: role.permissions?.length || 0
      }))
    });

    // Check all roles
    const allRoles = await Role.find({});
    console.log('\nAll Roles in database:');
    allRoles.forEach(role => {
      console.log(`- ${role.name}: ${role.permissions?.length || 0} permissions`);
    });

    // Check customers
    const Customer = require('./models/Customer');
    const customers = await Customer.find({});
    console.log(`\nCustomers in database: ${customers.length}`);
    customers.forEach(customer => {
      console.log(`- ${customer.organisation?.name || 'Unnamed Customer'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB disconnected.');
  }
}

checkDemoUser();
