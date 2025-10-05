const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function checkCollections() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log('Collections in database:');
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} documents`);
    }

    // Check for floors-related collections
    console.log('\n=== Checking floor-related collections ===');
    const floorCollections = collections.filter(c => c.name.toLowerCase().includes('floor'));

    if (floorCollections.length > 0) {
      for (const col of floorCollections) {
        console.log(`\nCollection: ${col.name}`);
        const sample = await mongoose.connection.db.collection(col.name).findOne();
        if (sample) {
          console.log('Sample document:', JSON.stringify(sample, null, 2).substring(0, 500));
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkCollections();
