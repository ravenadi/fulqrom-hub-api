/**
 * Check in-app notifications
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('../models/Notification');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function checkNotifications() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    const notifs = await Notification.find({ 
      type: 'document_expiry_reminder' 
    })
    .sort({ created_at: -1 })
    .limit(5)
    .lean();

    console.log(`Found ${notifs.length} recent expiry reminder notifications:\n`);

    notifs.forEach((n, index) => {
      console.log(`${index + 1}. ${n.title}`);
      console.log(`   User: ${n.user_email}`);
      console.log(`   Message: ${n.message}`);
      console.log(`   Is Read: ${n.is_read}`);
      console.log(`   Email Sent: ${n.email_sent ? 'Yes ✅' : 'No ❌'}`);
      console.log(`   Email Status: ${n.email_status || 'not_sent'}`);
      console.log(`   Created: ${n.created_at}`);
      console.log('');
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNotifications();

