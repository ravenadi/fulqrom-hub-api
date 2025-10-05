const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function cleanupDuplicateAssets() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const assetsCollection = db.collection('assets');

    const totalAssets = await assetsCollection.countDocuments();
    console.log(`Total assets in database: ${totalAssets}\n`);

    let totalDeleted = 0;

    // ============================================
    // 1. Clean up duplicates by asset_no + customer_id
    // ============================================
    console.log('=== CLEANING DUPLICATES BY asset_no + customer_id ===\n');

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
      }
    ]).toArray();

    console.log(`Found ${duplicatesByAssetNo.length} groups of duplicate assets by asset_no\n`);

    for (const group of duplicatesByAssetNo) {
      const { customer_id, asset_no } = group._id;
      const assets = group.assets;

      // Sort by createdAt (oldest first), handle undefined
      assets.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateA - dateB;
      });

      const keepAsset = assets[0];
      const deleteAssets = assets.slice(1);

      console.log(`Customer: ${customer_id}`);
      console.log(`Asset No: "${asset_no}"`);
      console.log(`Total records: ${assets.length}`);
      console.log(`✓ Keeping: ${keepAsset.id} (created: ${keepAsset.createdAt || 'N/A'})`);
      console.log(`✗ Deleting ${deleteAssets.length} duplicate(s):`);

      for (const asset of deleteAssets) {
        console.log(`  - ${asset.id} (created: ${asset.createdAt || 'N/A'})`);
        await assetsCollection.deleteOne({ _id: asset.id });
        totalDeleted++;
      }
      console.log('');
    }

    // ============================================
    // 2. Clean up duplicates by device_id + customer_id
    //    (Skip null/empty device_ids)
    // ============================================
    console.log('\n=== CLEANING DUPLICATES BY device_id + customer_id ===\n');

    const duplicatesByDeviceId = await assetsCollection.aggregate([
      {
        $match: {
          device_id: {
            $exists: true,
            $ne: null,
            $ne: '',
            $ne: 'null', // Skip string "null" values
            $ne: 'N/A',
            $ne: 'n/a'
          }
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
      }
    ]).toArray();

    console.log(`Found ${duplicatesByDeviceId.length} groups of duplicate assets by device_id\n`);

    for (const group of duplicatesByDeviceId) {
      const { customer_id, device_id } = group._id;
      const assets = group.assets;

      // Sort by createdAt (oldest first), handle undefined
      assets.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateA - dateB;
      });

      const keepAsset = assets[0];
      const deleteAssets = assets.slice(1);

      console.log(`Customer: ${customer_id}`);
      console.log(`Device ID: "${device_id}"`);
      console.log(`Total records: ${assets.length}`);
      console.log(`✓ Keeping: ${keepAsset.id} (Asset No: ${keepAsset.asset_no}, created: ${keepAsset.createdAt || 'N/A'})`);
      console.log(`✗ Deleting ${deleteAssets.length} duplicate(s):`);

      for (const asset of deleteAssets) {
        console.log(`  - ${asset.id} (Asset No: ${asset.asset_no}, created: ${asset.createdAt || 'N/A'})`);
        await assetsCollection.deleteOne({ _id: asset.id });
        totalDeleted++;
      }
      console.log('');
    }

    console.log('\n✅ Cleanup complete!');
    console.log(`Total assets deleted: ${totalDeleted}`);
    console.log(`Total assets remaining: ${totalAssets - totalDeleted}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

cleanupDuplicateAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
