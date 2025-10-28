/**
 * Test query for specific expiry dates
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function testSpecificDate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Test for 2025-10-29 (document we know exists)
    const targetDate = '2025-10-29';
    
    console.log(`Testing query for expiry date: ${targetDate}`);
    console.log('--- Using same query as reminder service ---\n');

    const escapedDate = targetDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const query = {
      $or: [
        { expiry_date: targetDate },
        { expiry_date: { $regex: `^${escapedDate}` } },
        { 'metadata.expiry_date': targetDate },
        { 'metadata.expiry_date': { $regex: `^${escapedDate}` } }
      ]
    };

    console.log('Query:', JSON.stringify(query, null, 2));
    console.log('\nExecuting query...\n');

    const docs = await Document.find(query).select('name expiry_date metadata.expiry_date created_by').lean();
    
    console.log(`Found ${docs.length} documents:`);
    docs.forEach(doc => {
      console.log(`  - "${doc.name}"`);
      console.log(`    expiry_date: ${doc.expiry_date || 'N/A'}`);
      console.log(`    metadata.expiry_date: ${doc.metadata?.expiry_date || 'N/A'}`);
      if (doc.created_by && typeof doc.created_by === 'object') {
        console.log(`    Created by: ${doc.created_by.email || doc.created_by.user_email || 'N/A'}`);
      }
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSpecificDate();

