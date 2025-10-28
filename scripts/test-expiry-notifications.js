/**
 * Test script for document expiry notifications
 * This helps verify that the notification system is working correctly
 * 
 * Usage: node scripts/test-expiry-notifications.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('../models/Document');
const reminderService = require('../services/reminderService');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function testExpiryNotifications() {
  try {
    console.log('='.repeat(80));
    console.log('Testing Document Expiry Notifications');
    console.log('='.repeat(80));

    // Connect to database
    if (mongoose.connection.readyState !== 1) {
      console.log('\nConnecting to database...');
      await mongoose.connect(MONGODB_URI);
      console.log('✓ Database connected\n');
    }

    // Get today's date and tomorrow's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`Today: ${todayStr}`);
    console.log(`Tomorrow: ${tomorrowStr}\n`);

    // Find documents expiring today (using same logic as reminder service)
    console.log('--- Checking documents expiring today ---');
    const todayDocs = await Document.find({
      $or: [
        { expiry_date: todayStr },
        { expiry_date: { $regex: `^${todayStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': todayStr },
        { 'metadata.expiry_date': { $regex: `^${todayStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      ]
    }).lean();

    console.log(`Found ${todayDocs.length} documents expiring today:`);
    todayDocs.forEach(doc => {
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      const createdBy = doc.created_by?.email || doc.created_by?.user_email || doc.created_by || 'Unknown';
      console.log(`  - "${doc.name}" (ID: ${doc._id})`);
      console.log(`    Expiry: ${expiryDate}`);
      console.log(`    Created by: ${createdBy}`);
      console.log(`    Tenant: ${doc.tenant_id || 'N/A'}`);
    });

    // Find documents expiring tomorrow (using same logic as reminder service)
    console.log('\n--- Checking documents expiring tomorrow ---');
    const tomorrowDocs = await Document.find({
      $or: [
        { expiry_date: tomorrowStr },
        { expiry_date: { $regex: `^${tomorrowStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': tomorrowStr },
        { 'metadata.expiry_date': { $regex: `^${tomorrowStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      ]
    }).lean();

    console.log(`Found ${tomorrowDocs.length} documents expiring tomorrow:`);
    tomorrowDocs.forEach(doc => {
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      const createdBy = doc.created_by?.email || doc.created_by?.user_email || doc.created_by || 'Unknown';
      console.log(`  - "${doc.name}" (ID: ${doc._id})`);
      console.log(`    Expiry: ${expiryDate}`);
      console.log(`    Created by: ${createdBy}`);
      console.log(`    Tenant: ${doc.tenant_id || 'N/A'}`);
    });

    // Test the reminder service
    console.log('\n' + '='.repeat(80));
    console.log('Running Reminder Service Test');
    console.log('='.repeat(80));

    // Calculate actual days until expiry for found documents
    const documentsToTest = [...todayDocs, ...tomorrowDocs];
    const uniqueDaysUntilExpiry = new Set();
    
    if (documentsToTest.length === 0) {
      console.log('\n⚠ No documents found expiring today or tomorrow');
      console.log('Testing with default reminder intervals (1, 7, 30 days)...\n');
    } else {
      // Calculate days until expiry for each document
      documentsToTest.forEach(doc => {
        const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
        if (expiryDate) {
          const expiry = new Date(expiryDate);
          const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          if (daysUntil >= 0) {
            uniqueDaysUntilExpiry.add(daysUntil);
          }
        }
      });

      if (uniqueDaysUntilExpiry.size > 0) {
        console.log(`\nTesting reminders for documents expiring in: ${Array.from(uniqueDaysUntilExpiry).sort((a, b) => a - b).join(', ')} days\n`);
      }
    }

    // Test with actual days until expiry found, or default intervals
    const daysToTest = uniqueDaysUntilExpiry.size > 0 
      ? Array.from(uniqueDaysUntilExpiry).sort((a, b) => a - b)
      : [1, 7, 30]; // Default intervals

    for (const days of daysToTest) {
      console.log(`--- Testing ${days}-day reminder ---`);
      const results = await reminderService.sendExpiryReminders([days]);
      console.log(`Results: ${results.sent} sent, ${results.failed} failed`);
      if (results.documents.length > 0) {
        results.documents.forEach(doc => {
          console.log(`  ✓ "${doc.name}" - ${doc.recipients_count} recipient(s)`);
        });
      }
    }

    // Show all documents with expiry dates for debugging and test with their actual expiry days
    console.log('\n' + '='.repeat(80));
    console.log('All Documents with Expiry Dates (next 7 days)');
    console.log('='.repeat(80));
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    // Find all documents expiring in next 7 days
    // Build a list of date patterns to match
    const datePatterns = [];
    for (let i = 0; i <= 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const checkDateStr = checkDate.toISOString().split('T')[0];
      datePatterns.push(
        { expiry_date: checkDateStr },
        { expiry_date: { $regex: `^${checkDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        { 'metadata.expiry_date': checkDateStr },
        { 'metadata.expiry_date': { $regex: `^${checkDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
      );
    }

    const allExpiringDocs = await Document.find({
      $or: datePatterns
    })
    .select('name expiry_date metadata.expiry_date created_by tenant_id')
    .lean();

    console.log(`\nFound ${allExpiringDocs.length} documents expiring in the next 7 days:`);
    const testDaysSet = new Set();
    
    allExpiringDocs.forEach(doc => {
      const expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
      const createdBy = doc.created_by?.email || doc.created_by?.user_email || doc.created_by || 'Unknown';
      
      // Calculate days until expiry
      let daysUntil = 'N/A';
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 30) {
          testDaysSet.add(daysUntil);
        }
      }
      
      console.log(`  - "${doc.name}"`);
      console.log(`    Expiry: ${expiryDate}`);
      console.log(`    Days until expiry: ${daysUntil}`);
      console.log(`    Created by: ${createdBy}`);
    });

    // Test with the actual days found
    if (testDaysSet.size > 0) {
      console.log(`\n` + '='.repeat(80));
      console.log(`Testing Reminder Service with Actual Expiry Days`);
      console.log('='.repeat(80));
      
      const sortedDays = Array.from(testDaysSet).sort((a, b) => a - b);
      console.log(`Testing reminders for: ${sortedDays.join(', ')} days\n`);
      
      for (const days of sortedDays) {
        console.log(`--- Testing ${days}-day reminder ---`);
        const results = await reminderService.sendExpiryReminders([days]);
        console.log(`Results: ${results.sent} sent, ${results.failed} failed`);
        if (results.documents.length > 0) {
          results.documents.forEach(doc => {
            console.log(`  ✓ "${doc.name}" - ${doc.recipients_count} recipient(s)`);
          });
        }
      }
    }

    // Close database connection
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    console.log('\nTest completed!');

  } catch (error) {
    console.error('\nError during test:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testExpiryNotifications().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testExpiryNotifications };

