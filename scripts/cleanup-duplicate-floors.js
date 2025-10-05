const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function cleanupDuplicateFloors() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const floorsCollection = db.collection('floors');

    // Check total floors
    const totalFloors = await floorsCollection.countDocuments();
    console.log(`Total floors in database: ${totalFloors}`);

    if (totalFloors === 0) {
      console.log('⚠️  No floors found in database. Nothing to clean up.');
      return;
    }

    // Find all floors grouped by customer_id and floor_name
    const duplicates = await floorsCollection.aggregate([
      {
        $group: {
          _id: {
            customer_id: '$customer_id',
            floor_name: '$floor_name'
          },
          floors: {
            $push: {
              id: '$_id',
              createdAt: '$createdAt',
              building_id: '$building_id',
              site_id: '$site_id'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 } // Only groups with more than 1 floor
        }
      },
      {
        $sort: { '_id.customer_id': 1, '_id.floor_name': 1 }
      }
    ]).toArray();

    console.log(`\nFound ${duplicates.length} groups of duplicate floors\n`);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    let totalDeleted = 0;

    for (const group of duplicates) {
      const { customer_id, floor_name } = group._id;
      const floors = group.floors;

      // Sort by createdAt (oldest first)
      floors.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateA - dateB;
      });

      // Keep the oldest floor (first one)
      const keepFloor = floors[0];
      const deleteFloors = floors.slice(1); // All except the first one

      console.log(`Customer ID: ${customer_id}`);
      console.log(`Floor Name: "${floor_name}"`);
      console.log(`Total records: ${floors.length}`);
      console.log(`✓ Keeping: ${keepFloor.id} (created: ${keepFloor.createdAt})`);
      console.log(`✗ Deleting ${deleteFloors.length} duplicate(s):`);

      // Delete duplicate floors
      for (const floor of deleteFloors) {
        console.log(`  - ${floor.id} (created: ${floor.createdAt})`);
        await floorsCollection.deleteOne({ _id: floor.id });
        totalDeleted++;
      }
      console.log('');
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`Total floors deleted: ${totalDeleted}`);
    console.log(`Total floors remaining: ${totalFloors - totalDeleted}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the cleanup
cleanupDuplicateFloors().catch(err => {
  console.error(err);
  process.exit(1);
});
