/**
 * Test sending notification for a specific document
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');
const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function testNotificationSend() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Find document expiring on 2025-10-29
    const targetDate = '2025-10-29';
    const escapedDate = targetDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const query = {
      $or: [
        { expiry_date: targetDate },
        { expiry_date: { $regex: `^${escapedDate}` } },
        { 'metadata.expiry_date': targetDate },
        { 'metadata.expiry_date': { $regex: `^${escapedDate}` } }
      ]
    };

    const docs = await Document.find(query).lean();
    
    console.log(`Found ${docs.length} documents expiring on ${targetDate}\n`);

    for (const doc of docs) {
      console.log(`--- Testing document: "${doc.name}" ---`);
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      console.log(`Expiry: ${expiryDate}`);
      
      // Get recipients
      const recipients = reminderService.getDocumentRecipients(doc);
      console.log(`Recipients found: ${recipients.length}`);
      recipients.forEach(rec => {
        console.log(`  - ${rec.user_email} (ID: ${rec.user_id})`);
      });

      if (recipients.length === 0) {
        console.log('⚠ No recipients found - notification will not be sent');
        console.log(`Document created_by: ${JSON.stringify(doc.created_by, null, 2)}`);
        continue;
      }

      // Calculate days until expiry from today (2025-10-27)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryDateObj = new Date(expiryDate);
      const daysUntil = Math.ceil((expiryDateObj - today) / (1000 * 60 * 60 * 24));
      
      console.log(`Days until expiry: ${daysUntil}`);
      console.log(`\nSending test notification (simulating ${daysUntil}-day reminder)...\n`);
      
      // Manually test sending notification with the correct days
      const results = await reminderService.sendExpiryReminders([daysUntil]);
      console.log(`Results: ${results.sent} sent, ${results.failed} failed`);
    }

    await mongoose.connection.close();
    console.log('\n✓ Test completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testNotificationSend();

