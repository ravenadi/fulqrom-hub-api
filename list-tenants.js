const mongoose = require('mongoose');
require('dotenv').config();

const TenantOrg = require('./models/TenantOrg');
const Organization = require('./models/Organization');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub')
  .then(async () => {
    console.log('=== All Tenants ===');
    const tenants = await TenantOrg.find().lean();
    console.log(`Found ${tenants.length} tenants`);
    tenants.forEach(t => {
      console.log(`- ${t.name} (${t._id})`);
    });

    console.log('\n=== All Organizations ===');
    const orgs = await Organization.find().lean();
    console.log(`Found ${orgs.length} organizations`);
    orgs.forEach(o => {
      console.log(`- ${o.name} (${o._id}) -> Tenant: ${o.tenant_id}`);
    });

    console.log('\n=== ana@user.com Details ===');
    const ana = await User.findOne({ email: 'ana@user.com' }).lean();
    console.log('Ana tenant_id:', ana.tenant_id);

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
