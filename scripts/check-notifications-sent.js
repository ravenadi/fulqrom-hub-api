/**
 * Check notifications that were sent and their email status
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('../models/Notification');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function checkNotifications() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Find recent expiry reminder notifications
    const notifications = await Notification.find({
      type: 'document_expiry_reminder',
      created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .sort({ created_at: -1 })
    .lean();

    console.log(`Found ${notifications.length} expiry reminder notifications in last 24 hours:\n`);

    notifications.forEach((notif, index) => {
      console.log(`${index + 1}. "${notif.document_name}"`);
      console.log(`   User: ${notif.user_email}`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Created: ${notif.created_at}`);
      console.log(`   Email Status: ${notif.email_status || 'not_sent'}`);
      console.log(`   Email Sent: ${notif.email_sent ? 'Yes' : 'No'}`);
      if (notif.email_error) {
        console.log(`   Email Error: ${notif.email_error}`);
      }
      if (notif.email_sent_at) {
        console.log(`   Email Sent At: ${notif.email_sent_at}`);
      }
      console.log(`   Provider: ${notif.email_provider_id || 'N/A'}`);
      console.log('');
    });

    // Check email service configuration
    console.log('='.repeat(80));
    console.log('Email Service Configuration:');
    console.log('='.repeat(80));
    console.log(`MAIL_PROVIDER: ${process.env.MAIL_PROVIDER || 'console (default)'}`);
    console.log(`MAIL_FROM_ADDRESS: ${process.env.MAIL_FROM_ADDRESS || 'not set'}`);
    console.log(`CLIENT_URL: ${process.env.CLIENT_URL || 'not set'}`);

    if (process.env.MAIL_PROVIDER === 'console' || !process.env.MAIL_PROVIDER) {
      console.log('\n⚠ WARNING: MAIL_PROVIDER is set to "console" - emails are logged to console only!');
      console.log('   To send actual emails, set MAIL_PROVIDER=smtp, sendgrid, or ses in .env file');
    }

    await mongoose.connection.close();
    console.log('\n✓ Test completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNotifications();

