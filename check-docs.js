const mongoose = require('mongoose');
const Document = require('./models/Document');

async function checkDocuments() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB');

    // Get the latest 5 documents
    const docs = await Document.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log('\n📄 Latest 5 Documents:\n');
    docs.forEach((doc, idx) => {
      console.log(`${idx + 1}. Document ID: ${doc._id}`);
      console.log(`   Name: ${doc.name}`);
      console.log(`   Created: ${doc.createdAt}`);
      console.log(`   Has file: ${!!doc.file}`);
      console.log(`   Has file_meta: ${!!(doc.file && doc.file.file_meta)}`);
      console.log(`   Has file_key: ${!!(doc.file && doc.file.file_meta && doc.file.file_meta.file_key)}`);
      console.log(`   file_key: ${(doc.file && doc.file.file_meta && doc.file.file_meta.file_key) || 'MISSING'}`);
      console.log(`   bucket_name: ${(doc.file && doc.file.file_meta && doc.file.file_meta.bucket_name) || 'MISSING'}`);
      console.log('');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDocuments();
