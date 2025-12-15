const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_CONNECTION || 'mongodb://localhost:27017/fulqrom-hub')
  .then(async () => {
    console.log('=== All Collections ===');
    const collections = await mongoose.connection.db.listCollections().toArray();
    collections.forEach(c => {
      console.log(`- ${c.name}`);
    });

    console.log('\n=== Searching in all tenant-related collections ===');
    const tenantId = '68f8698dd323fdb068d06ba9';

    // Check if there's a plain 'tenants' collection
    const tenantCollections = collections.filter(c =>
      c.name.toLowerCase().includes('tenant')
    );

    for (const col of tenantCollections) {
      console.log(`\nChecking ${col.name}...`);
      const docs = await mongoose.connection.db.collection(col.name)
        .find({ _id: new mongoose.Types.ObjectId(tenantId) })
        .toArray();
      console.log(`Found ${docs.length} documents`);
      if (docs.length > 0) {
        console.log('Document:', JSON.stringify(docs[0], null, 2));
      }
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
