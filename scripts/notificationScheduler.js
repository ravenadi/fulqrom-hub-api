/**
 * Notification Scheduler
 * Runs periodic checks for document expiry and service report reminders
 *
 * Usage:
 * 1. One-time run: node scripts/notificationScheduler.js
 * 2. With node-cron (install first: npm install node-cron):
 *    - Uncomment the cron setup at the bottom
 *    - Run: node scripts/notificationScheduler.js --daemon
 * 3. With system cron:
 *    - Add to crontab: 0 9 * * * cd /path/to/rest-api && node scripts/notificationScheduler.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

/**
 * Run all reminder checks
 */
async function runReminderChecks() {
  console.log('='.repeat(80));
  console.log(`Starting reminder checks at ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  try {
    // Connect to database
    if (mongoose.connection.readyState !== 1) {
      console.log('Connecting to database...');
      await mongoose.connect(MONGODB_URI);
      console.log('✓ Database connected');
    }

    // Run expiry reminders (30 days, 7 days, 1 day before)
    console.log('\n--- Checking Document Expiry Reminders ---');
    const expiryResults = await reminderService.sendExpiryReminders([30, 7, 1]);
    console.log(`✓ Expiry reminders: ${expiryResults.sent} sent, ${expiryResults.failed} failed`);
    if (expiryResults.documents.length > 0) {
      console.log('Documents with expiry reminders:');
      expiryResults.documents.forEach(doc => {
        console.log(`  - ${doc.name} (expires in ${doc.days_until_expiry} days, ${doc.recipients_count} recipients)`);
      });
    }

    // Run service report reminders
    console.log('\n--- Checking Service Report Reminders ---');
    const serviceResults = await reminderService.sendServiceReportReminders();
    console.log(`✓ Service report reminders: ${serviceResults.sent} sent, ${serviceResults.failed} failed`);
    if (serviceResults.documents.length > 0) {
      console.log('Service reports with reminders:');
      serviceResults.documents.forEach(doc => {
        console.log(`  - ${doc.name} (${doc.frequency}, due in ${doc.days_until_due} days, ${doc.recipients_count} recipients)`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('Reminder checks completed successfully');
    console.log('='.repeat(80));

    return {
      success: true,
      expiry: expiryResults,
      service: serviceResults
    };
  } catch (error) {
    console.error('Error running reminder checks:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const isDaemonMode = args.includes('--daemon');

  if (isDaemonMode) {
    console.log('Starting in daemon mode with node-cron...');

    try {
      const cron = require('node-cron');

      // Connect to database once
      await mongoose.connect(MONGODB_URI);
      console.log('✓ Database connected');

      // Schedule daily at 9:00 AM
      cron.schedule('0 9 * * *', async () => {
        console.log('\n' + '='.repeat(80));
        console.log('Scheduled job triggered');
        await runReminderChecks();
      });

      // Run immediately on startup
      await runReminderChecks();

      console.log('\n✓ Scheduler started successfully');
      console.log('  - Running daily at 9:00 AM');
      console.log('  - Press Ctrl+C to stop');

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\nShutting down scheduler...');
        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        process.exit(0);
      });

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.error('Error: node-cron is not installed');
        console.error('Please install it: npm install node-cron');
        process.exit(1);
      }
      throw error;
    }
  } else {
    // One-time run
    const results = await runReminderChecks();

    // Close database connection
    await mongoose.connection.close();
    console.log('✓ Database connection closed');

    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runReminderChecks };
