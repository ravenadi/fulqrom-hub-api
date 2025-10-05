const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');

const MONGODB_URI = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function reimportAssets() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const assetsCollection = db.collection('assets');
    const sitesCollection = db.collection('sites');
    const buildingsCollection = db.collection('buildings');

    // Customer ID
    const customer_id = new mongoose.Types.ObjectId('68d3929ae4c5d9b3e920a9df');

    // Find site ID for "200 St. Georges Terrace"
    const site = await sitesCollection.findOne({
      site_name: '200 St. Georges Terrace',
      customer_id: customer_id
    });

    if (!site) {
      console.error('❌ Site "200 St. Georges Terrace" not found');
      return;
    }

    console.log(`Found site: ${site.site_name} (ID: ${site._id})`);

    // Find building ID for "200 St. Georges Terrace"
    const building = await buildingsCollection.findOne({
      site_id: site._id,
      $or: [
        { building_name: '200 St. Georges Terrace' },
        { building_name: 'Corporate Tower North' } // In case it's using this name
      ]
    });

    console.log(`Found building: ${building ? building.building_name : 'Not found'} (ID: ${building ? building._id : 'N/A'})\n`);

    // Delete existing assets for this site/customer
    console.log('Deleting existing assets for:');
    console.log(`  Customer: ${customer_id}`);
    console.log(`  Site: ${site._id}`);
    if (building) {
      console.log(`  Building: ${building._id}`);
    }

    const deleteFilter = {
      customer_id: customer_id,
      site_id: site._id
    };

    const existingCount = await assetsCollection.countDocuments(deleteFilter);
    console.log(`\nFound ${existingCount} existing assets to delete...`);

    const deleteResult = await assetsCollection.deleteMany(deleteFilter);
    console.log(`✓ Deleted ${deleteResult.deletedCount} assets\n`);

    // Read and import CSV
    console.log('Importing assets from CSV...\n');

    const csvPath = '/Users/devensitapara/Documents/development/GKBLabs/falcrom/fulqrom-hub/rest-api/data/200SGT.csv';
    const assets = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          // Map CSV columns to asset schema
          const asset = {
            customer_id: customer_id,
            site_id: new mongoose.Types.ObjectId(row.Site_id || site._id),
            building_id: building ? building._id : null,

            // Primary Information
            asset_id: row['Asset ID'] || null,
            asset_no: row['Asset No'] || null,
            device_id: row['Device ID'] || null,

            // Classification & Status
            status: row.Status || 'Active',
            category: row.Category || null,
            type: row.Type || null,
            condition: row.Condition || null,

            // Details
            make: row.Make || null,
            model: row.Model || null,
            serial: row.Serial || null,

            // HVAC/Refrigerant Information
            refrigerant: row.Refrigerant || null,
            refrigerant_capacity: row['Refrigerant Capacity'] || null,
            refrigerant_consumption: row['Refrigerant Consumption'] || null,

            // Location Information
            level: row.Level || null,
            area: row.Area || null,

            // Ownership & Service
            owner: row.Owner || null,
            da19_life_expectancy: row['DA19 Life Expectancy'] || null,
            service_status: row['Service Status'] || null,

            // Dates & Testing
            installation_date: parseDate(row['Date of Installation']),
            age: row.Age || null,
            last_test_date: parseDate(row['Last Test Date']),
            last_test_result: row['Last Test Result'] || null,

            // Financial
            purchase_cost: parseFloat(row['Purchase Cost (AUD)']) || null,
            current_book_value: parseFloat(row['Current Book Value (AUD)']) || null,
            weight: parseFloat(row['Weight (KG\'s)']) || null,

            // System fields
            is_active: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Clean up null/empty values
          Object.keys(asset).forEach(key => {
            if (asset[key] === null || asset[key] === '' || asset[key] === 'N/A' || asset[key] === 'n/a' || asset[key] === 'NA') {
              delete asset[key];
            }
          });

          assets.push(asset);
        })
        .on('end', async () => {
          console.log(`Parsed ${assets.length} assets from CSV\n`);

          if (assets.length > 0) {
            try {
              const insertResult = await assetsCollection.insertMany(assets, { ordered: false });
              console.log(`✅ Imported ${insertResult.insertedCount} assets successfully\n`);

              // Show sample
              console.log('Sample imported assets:');
              assets.slice(0, 5).forEach((asset, idx) => {
                console.log(`  ${idx + 1}. ${asset.asset_no} - ${asset.category} - ${asset.type}`);
              });

              resolve();
            } catch (error) {
              if (error.code === 11000) {
                // Duplicate key error - some assets already exist
                console.log(`⚠️  Some assets already exist (duplicate key error)`);
                console.log(`Inserted: ${error.result?.nInserted || 0} assets`);
              } else {
                reject(error);
              }
              resolve();
            }
          } else {
            console.log('❌ No assets to import');
            resolve();
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Helper function to parse dates
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === '' || dateStr === 'TBC') return null;

  // Try parsing different formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

reimportAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
