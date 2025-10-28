/**
 * Reset/Delete expiry reminder notifications for testing
 * This allows you to retest the notification system
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('../models/Notification');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function resetNotifications() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    // Find all expiry reminder notifications
    const notifications = await Notification.find({
      type: 'document_expiry_reminder'
    }).lean();

    console.log(`Found ${notifications.length} expiry reminder notifications\n`);

    if (notifications.length === 0) {
      console.log('No notifications to reset.');
      await mongoose.connection.close();
      return;
    }

    // Show what will be deleted
    console.log('Notifications to be deleted:');
    notifications.slice(0, 10).forEach((notif, index) => {
      console.log(`  ${index + 1}. "${notif.document_name}" - ${notif.user_email} (${notif.created_at})`);
    });
    if (notifications.length > 10) {
      console.log(`  ... and ${notifications.length - 10} more`);
    }

    // Delete all expiry reminder notifications
    const result = await Notification.deleteMany({
      type: 'document_expiry_reminder'
    });

    console.log(`\n✅ Deleted ${result.deletedCount} expiry reminder notifications`);
    console.log('\nYou can now run the test again to send fresh notifications.\n');

    await mongoose.connection.close();
    console.log('✓ Database connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  resetNotifications();
}

module.exports = { resetNotifications };

