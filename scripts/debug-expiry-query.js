/**
 * Debug script to test expiry date queries directly
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function debugExpiryQuery() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 2); // 2 days from now (2025-10-29)
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`Today: ${today.toISOString().split('T')[0]}`);
    console.log(`Target date (2 days): ${targetDateStr}\n`);

    // Test 1: Direct string match
    console.log('--- Test 1: Direct string match ---');
    const directMatch = await Document.find({
      expiry_date: targetDateStr
    }).select('name expiry_date').lean();
    console.log(`Found: ${directMatch.length} documents`);
    directMatch.forEach(doc => console.log(`  - ${doc.name}: ${doc.expiry_date}`));

    // Test 2: Regex match
    console.log('\n--- Test 2: Regex match ---');
    const regexMatch = await Document.find({
      expiry_date: { $regex: `^${targetDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
    }).select('name expiry_date').lean();
    console.log(`Found: ${regexMatch.length} documents`);
    regexMatch.forEach(doc => console.log(`  - ${doc.name}: ${doc.expiry_date}`));

    // Test 3: Combined OR query
    console.log('\n--- Test 3: Combined OR query (as in service) ---');
    const combinedMatch = await Document.find({
      $or: [
        { expiry_date: targetDateStr },
        { expiry_date: { $regex: `^${targetDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': targetDateStr },
        { 'metadata.expiry_date': { $regex: `^${targetDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      ]
    }).select('name expiry_date metadata.expiry_date').lean();
    console.log(`Found: ${combinedMatch.length} documents`);
    combinedMatch.forEach(doc => {
      console.log(`  - ${doc.name}`);
      console.log(`    expiry_date: ${doc.expiry_date}`);
      console.log(`    metadata.expiry_date: ${doc.metadata?.expiry_date || 'N/A'}`);
    });

    // Test 4: All documents with expiry dates to see what format they're in
    console.log('\n--- Test 4: Sample of all documents with expiry dates ---');
    const allWithExpiry = await Document.find({
      $or: [
        { expiry_date: { $exists: true, $ne: null, $ne: '' } },
        { 'metadata.expiry_date': { $exists: true, $ne: null, $ne: '' } }
      ]
    }).select('name expiry_date metadata.expiry_date').limit(10).lean();
    console.log(`Found: ${allWithExpiry.length} sample documents`);
    allWithExpiry.forEach(doc => {
      console.log(`  - ${doc.name}`);
      console.log(`    expiry_date: ${doc.expiry_date || 'N/A'}`);
      console.log(`    metadata.expiry_date: ${doc.metadata?.expiry_date || 'N/A'}`);
      if (doc.expiry_date) {
        console.log(`    Type: ${typeof doc.expiry_date}`);
        console.log(`    Normalized: ${doc.expiry_date.split('T')[0]}`);
      }
    });

    await mongoose.connection.close();
    console.log('\n✓ Test completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugExpiryQuery();

