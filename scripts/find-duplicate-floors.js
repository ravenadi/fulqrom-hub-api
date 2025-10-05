const mongoose = require('mongoose');
const Floor = require('../models/Floor');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function findDuplicates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const customer_id = '68d3929ae4c5d9b3e920a9df';

    // Get all floors for this customer
    const floors = await Floor.find({ customer_id })
      .select('_id floor_name floor_number site_id building_id createdAt')
      .sort({ floor_name: 1, createdAt: 1 })
      .lean();

    console.log(`Total floors for customer ${customer_id}: ${floors.length}\n`);

    // Group by floor_name
    const grouped = {};
    floors.forEach(floor => {
      const key = floor.floor_name;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(floor);
    });

    // Show duplicates
    console.log('=== DUPLICATE FLOOR NAMES ===\n');
    let foundDuplicates = false;

    Object.keys(grouped).sort().forEach(floorName => {
      const floorsWithSameName = grouped[floorName];
      if (floorsWithSameName.length > 1) {
        foundDuplicates = true;
        console.log(`Floor Name: "${floorName}" (${floorsWithSameName.length} records)`);
        floorsWithSameName.forEach((floor, idx) => {
          console.log(`  ${idx + 1}. ID: ${floor._id}`);
          console.log(`     Site: ${floor.site_id || 'null'}`);
          console.log(`     Building: ${floor.building_id || 'null'}`);
          console.log(`     Floor #: ${floor.floor_number}`);
          console.log(`     Created: ${floor.createdAt}`);
        });
        console.log('');
      }
    });

    if (!foundDuplicates) {
      console.log('No duplicates found based on floor_name + customer_id');
    }

    // Also check for building_id + floor_name duplicates
    console.log('\n=== CHECKING DUPLICATES BY BUILDING + FLOOR NAME ===\n');
    const buildingGrouped = {};
    floors.forEach(floor => {
      const key = `${floor.building_id || 'null'}_${floor.floor_name}`;
      if (!buildingGrouped[key]) {
        buildingGrouped[key] = [];
      }
      buildingGrouped[key].push(floor);
    });

    let foundBuildingDuplicates = false;
    Object.keys(buildingGrouped).forEach(key => {
      const floorsInBuilding = buildingGrouped[key];
      if (floorsInBuilding.length > 1) {
        foundBuildingDuplicates = true;
        const [building_id, floor_name] = key.split('_');
        console.log(`Building: ${building_id}, Floor: "${floor_name}" (${floorsInBuilding.length} records)`);
        floorsInBuilding.forEach((floor, idx) => {
          console.log(`  ${idx + 1}. ID: ${floor._id}, Created: ${floor.createdAt}`);
        });
        console.log('');
      }
    });

    if (!foundBuildingDuplicates) {
      console.log('No duplicates found based on building_id + floor_name');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

findDuplicates();
