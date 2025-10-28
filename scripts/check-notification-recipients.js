/**
 * Check who will receive notifications for documents
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');
const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function checkRecipients() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Find document expiring in 2 days
    const doc = await Document.findOne({ 
      expiry_date: { $regex: '^2025-10-29' }
    }).lean();

    if (!doc) {
      console.log('No document found expiring on 2025-10-29');
      await mongoose.connection.close();
      return;
    }

    console.log(`Document: "${doc.name}"`);
    console.log(`Expiry: ${doc.expiry_date}`);
    console.log(`\nCreated by:`, JSON.stringify(doc.created_by, null, 2));
    
    if (doc.approval_config && doc.approval_config.approvers) {
      console.log(`\nApprovers:`, JSON.stringify(doc.approval_config.approvers, null, 2));
    }
    
    if (doc.approved_by) {
      console.log(`\nApproved by: ${doc.approved_by}`);
    }

    // Get recipients
    const recipients = reminderService.getDocumentRecipients(doc);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`RECIPIENTS FOR NOTIFICATIONS (${recipients.length} total):`);
    console.log('='.repeat(80));
    
    recipients.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.user_email}`);
      console.log(`   User ID: ${rec.user_id}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRecipients();

