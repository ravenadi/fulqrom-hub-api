/**
 * Check created notifications
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Notification = require('../models/Notification');

async function checkNotifications() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✓ Database connected\n');

    const notifications = await Notification.find()
      .sort({ created_at: -1 })
      .limit(20)
      .lean();

    console.log(`Found ${notifications.length} notifications:\n`);

    notifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.type}`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   To: ${notif.user_email}`);
      console.log(`   Priority: ${notif.priority}`);
      console.log(`   Read: ${notif.is_read}`);
      console.log(`   Created: ${notif.created_at}`);
      console.log('');
    });

    const unreadCount = await Notification.countDocuments({ is_read: false });
    console.log(`Total unread notifications: ${unreadCount}`);

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNotifications();
