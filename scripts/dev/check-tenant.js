const mongoose = require('mongoose');
require('dotenv').config();

const TenantOrg = require('./models/TenantOrg');
const Organization = require('./models/Organization');

mongoose.connect(process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub')
  .then(async () => {
    const tenantId = '68f8698dd323fdb068d06ba9';

    console.log('=== Searching for Tenant ===');
    const tenant = await TenantOrg.findById(tenantId).lean();
    console.log('Tenant:', JSON.stringify(tenant, null, 2));

    console.log('\n=== Searching for Organization ===');
    const org = await Organization.findOne({ tenant_id: tenantId }).lean();
    console.log('Organization:', JSON.stringify(org, null, 2));

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
