const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function findDuplicateAssets() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const assetsCollection = db.collection('assets');

    const totalAssets = await assetsCollection.countDocuments();
    console.log(`Total assets in database: ${totalAssets}\n`);

    // Check duplicates by asset_no + customer_id
    console.log('=== CHECKING DUPLICATES BY asset_no + customer_id ===\n');
    const duplicatesByAssetNo = await assetsCollection.aggregate([
      {
        $match: {
          asset_no: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: {
            customer_id: '$customer_id',
            asset_no: '$asset_no'
          },
          assets: {
            $push: {
              id: '$_id',
              asset_no: '$asset_no',
              category: '$category',
              type: '$type',
              createdAt: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { '_id.customer_id': 1, '_id.asset_no': 1 }
      }
    ]).toArray();

    if (duplicatesByAssetNo.length > 0) {
      console.log(`Found ${duplicatesByAssetNo.length} groups of duplicate assets by asset_no:\n`);
      duplicatesByAssetNo.forEach(group => {
        const { customer_id, asset_no } = group._id;
        console.log(`Customer: ${customer_id}`);
        console.log(`Asset No: "${asset_no}" (${group.count} duplicates)`);
        group.assets.forEach((asset, idx) => {
          console.log(`  ${idx + 1}. ID: ${asset.id}, Category: ${asset.category}, Type: ${asset.type}`);
        });
        console.log('');
      });
    } else {
      console.log('✅ No duplicates found by asset_no + customer_id\n');
    }

    // Check duplicates by device_id + customer_id
    console.log('=== CHECKING DUPLICATES BY device_id + customer_id ===\n');
    const duplicatesByDeviceId = await assetsCollection.aggregate([
      {
        $match: {
          device_id: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: {
            customer_id: '$customer_id',
            device_id: '$device_id'
          },
          assets: {
            $push: {
              id: '$_id',
              device_id: '$device_id',
              asset_no: '$asset_no',
              category: '$category',
              createdAt: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { '_id.customer_id': 1, '_id.device_id': 1 }
      }
    ]).toArray();

    if (duplicatesByDeviceId.length > 0) {
      console.log(`Found ${duplicatesByDeviceId.length} groups of duplicate assets by device_id:\n`);
      duplicatesByDeviceId.forEach(group => {
        const { customer_id, device_id } = group._id;
        console.log(`Customer: ${customer_id}`);
        console.log(`Device ID: "${device_id}" (${group.count} duplicates)`);
        group.assets.forEach((asset, idx) => {
          console.log(`  ${idx + 1}. ID: ${asset.id}, Asset No: ${asset.asset_no}, Category: ${asset.category}`);
        });
        console.log('');
      });
    } else {
      console.log('✅ No duplicates found by device_id + customer_id\n');
    }

    // Summary
    const totalDuplicateGroups = duplicatesByAssetNo.length + duplicatesByDeviceId.length;
    console.log('\n=== SUMMARY ===');
    console.log(`Total duplicate groups found: ${totalDuplicateGroups}`);
    console.log(`- By asset_no: ${duplicatesByAssetNo.length}`);
    console.log(`- By device_id: ${duplicatesByDeviceId.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

findDuplicateAssets();
