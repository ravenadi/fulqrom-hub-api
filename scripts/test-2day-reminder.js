/**
 * Test 2-day reminder (for document expiring on 2025-10-29)
 */

const mongoose = require('mongoose');
require('dotenv').config();
const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function test2DayReminder() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Test with 2 days (document expires on 2025-10-29, today is 2025-10-27)
    console.log('Testing 2-day reminder...\n');
    const results = await reminderService.sendExpiryReminders([2]);
    
    console.log(`\nResults: ${results.sent} sent, ${results.failed} failed`);
    if (results.documents.length > 0) {
      console.log('\nDocuments processed:');
      results.documents.forEach(doc => {
        console.log(`  ✓ "${doc.name}"`);
        console.log(`    Expiry: ${doc.expiry_date}`);
        console.log(`    Days until expiry: ${doc.days_until_expiry}`);
        console.log(`    Recipients: ${doc.recipients_count}`);
      });
    } else {
      console.log('\n⚠ No documents found for 2-day reminder');
    }

    await mongoose.connection.close();
    console.log('\n✓ Test completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test2DayReminder();

