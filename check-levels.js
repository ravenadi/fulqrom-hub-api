const mongoose = require('mongoose');
const Asset = require('./models/Asset');

mongoose.connect('mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/fulqrom-hub')
  .then(async () => {
    console.log('Connected to database');

    // First, check total count
    const totalCount = await Asset.countDocuments({});
    console.log(`Total assets in database: ${totalCount}`);

    const customerId = new mongoose.Types.ObjectId('68d3929ae4c5d9b3e920a9df');

    // Try to find any assets for this customer
    const assets = await Asset.find({
      customer_id: customerId
    })
    .select('asset_no level building_id customer_id')
    .lean();

    console.log(`\nAssets for customer ${customerId}: ${assets.length}\n`);

    // If still 0, try without converting to ObjectId
    if (assets.length === 0) {
      const assetsStr = await Asset.find({
        customer_id: '68d3929ae4c5d9b3e920a9df'
      })
      .select('asset_no level building_id customer_id')
      .lean();
      console.log(`Assets with string customer_id: ${assetsStr.length}\n`);
    }

    // Group by level to see variations
    const levelGroups = {};
    assets.forEach(asset => {
      const level = asset.level || 'null';
      if (!levelGroups[level]) {
        levelGroups[level] = [];
      }
      levelGroups[level].push(asset.asset_no);
    });

    console.log('Level variations found:\n');
    Object.keys(levelGroups).sort().forEach(level => {
      console.log(`  '${level}': ${levelGroups[level].length} assets`);
      // Show first few asset numbers as examples
      const examples = levelGroups[level].slice(0, 3).join(', ');
      console.log(`    Examples: ${examples}`);
    });

    console.log('\n');

    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
