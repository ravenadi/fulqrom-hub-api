const mongoose = require('mongoose');

const uri = 'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/hub_fulqrom';

async function cleanDropdownEmptyStrings() {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const Settings = mongoose.model('Settings', new mongoose.Schema({}, { strict: false, collection: 'settings' }));
    const setting = await Settings.findOne({ setting_key: 'dropdown_values' });

    if (!setting) {
      console.log('❌ No dropdown settings found');
      await mongoose.connection.close();
      return;
    }

    let totalCleaned = 0;

    // Clean all dropdown arrays
    const modules = Object.keys(setting.value);

    for (const module of modules) {
      const fields = Object.keys(setting.value[module]);

      for (const field of fields) {
        const values = setting.value[module][field];

        if (Array.isArray(values)) {
          const original = values.length;
          const cleaned = values.filter(v => {
            if (!v) return false; // Filter out null, undefined, false, 0
            if (typeof v !== 'string') return true; // Keep non-strings
            return v.trim().length > 0; // Filter out empty strings and whitespace-only
          });

          if (cleaned.length < original) {
            const removed = original - cleaned.length;
            console.log(`  ${module}.${field}: Removed ${removed} empty/blank value(s)`);
            setting.value[module][field] = cleaned;
            totalCleaned += removed;
          }
        }
      }
    }

    if (totalCleaned > 0) {
      await setting.save();
      console.log(`\n✅ Database updated - ${totalCleaned} total empty strings removed`);
    } else {
      console.log('\n✅ No empty strings found - database is clean');
    }

    await mongoose.connection.close();
    console.log('✅ Connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

cleanDropdownEmptyStrings();
