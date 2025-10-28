/**
 * Check documents expiring today and test notification logic
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');
const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function checkTodayExpiry() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`Today: ${todayStr}`);
    console.log(`Tomorrow: ${tomorrowStr}\n`);

    // Find documents expiring today using the same query as reminder service
    console.log('--- Documents expiring TODAY ---');
    const todayQuery = {
      $or: [
        { expiry_date: todayStr },
        { expiry_date: { $regex: `^${todayStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': todayStr },
        { 'metadata.expiry_date': { $regex: `^${todayStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      ]
    };

    const todayDocs = await Document.find(todayQuery).lean();
    console.log(`Found ${todayDocs.length} documents`);
    todayDocs.forEach(doc => {
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      const createdBy = doc.created_by?.email || doc.created_by?.user_email || doc.created_by;
      console.log(`  - "${doc.name}"`);
      console.log(`    Expiry: ${expiryDate}`);
      console.log(`    Created by: ${createdBy || 'Unknown'}`);
    });

    // Find documents expiring tomorrow
    console.log('\n--- Documents expiring TOMORROW ---');
    const tomorrowQuery = {
      $or: [
        { expiry_date: tomorrowStr },
        { expiry_date: { $regex: `^${tomorrowStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': tomorrowStr },
        { 'metadata.expiry_date': { $regex: `^${tomorrowStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      ]
    };

    const tomorrowDocs = await Document.find(tomorrowQuery).lean();
    console.log(`Found ${tomorrowDocs.length} documents`);
    tomorrowDocs.forEach(doc => {
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      const createdBy = doc.created_by?.email || doc.created_by?.user_email || doc.created_by;
      console.log(`  - "${doc.name}"`);
      console.log(`    Expiry: ${expiryDate}`);
      console.log(`    Created by: ${createdBy || 'Unknown'}`);
      console.log(`    Recipients: ${JSON.stringify(reminderService.getDocumentRecipients(doc))}`);
    });

    // Now test the actual reminder service with custom days
    console.log('\n--- Testing reminder service for TOMORROW (1 day) ---');
    const results = await reminderService.sendExpiryReminders([1]);
    console.log(`Results: ${results.sent} sent, ${results.failed} failed`);
    if (results.documents.length > 0) {
      results.documents.forEach(doc => {
        console.log(`  ✓ Sent to "${doc.name}" (${doc.recipients_count} recipients)`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✓ Test completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTodayExpiry();

