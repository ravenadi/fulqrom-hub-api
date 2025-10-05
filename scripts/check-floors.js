const mongoose = require('mongoose');
const Floor = require('../models/Floor');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function checkFloors() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get all floors
    const totalFloors = await Floor.countDocuments();
    console.log(`Total floors in database: ${totalFloors}\n`);

    // Get sample floors
    const sampleFloors = await Floor.find()
      .limit(10)
      .select('_id floor_name customer_id createdAt')
      .lean();

    console.log('Sample floors:');
    sampleFloors.forEach((floor, idx) => {
      console.log(`${idx + 1}. ${floor.floor_name}`);
      console.log(`   ID: ${floor._id}`);
      console.log(`   Customer ID: ${floor.customer_id} (type: ${typeof floor.customer_id})`);
      console.log(`   Created: ${floor.createdAt}`);
      console.log('');
    });

    // Find floors with specific customer_id as ObjectId
    const customer_id = new mongoose.Types.ObjectId('68d3929ae4c5d9b3e920a9df');
    const floorsForCustomer = await Floor.find({ customer_id })
      .select('_id floor_name floor_number site_id building_id createdAt')
      .sort({ floor_name: 1, createdAt: 1 })
      .lean();

    console.log(`\nFloors for customer ${customer_id}: ${floorsForCustomer.length}\n`);

    if (floorsForCustomer.length > 0) {
      // Group by floor_name to find duplicates
      const grouped = {};
      floorsForCustomer.forEach(floor => {
        const key = floor.floor_name;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(floor);
      });

      console.log('=== DUPLICATE FLOOR NAMES ===\n');
      Object.keys(grouped).sort().forEach(floorName => {
        const floors = grouped[floorName];
        if (floors.length > 1) {
          console.log(`Floor Name: "${floorName}" (${floors.length} duplicates)`);
          floors.forEach((floor, idx) => {
            console.log(`  ${idx + 1}. ID: ${floor._id}, Building: ${floor.building_id || 'null'}, Created: ${floor.createdAt}`);
          });
          console.log('');
        }
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkFloors();
