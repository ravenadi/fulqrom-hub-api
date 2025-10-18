/**
 * Create Test Documents for Reminder Testing
 * Creates sample documents with expiry dates and service reports for testing reminders
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Document = require('../models/Document');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function createTestDocuments() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Database connected\n');

    const today = new Date();
    const testDocs = [];

    // 1. Document expiring in 30 days
    const expiryDate30 = new Date(today);
    expiryDate30.setDate(today.getDate() + 30);

    const doc30Days = new Document({
      name: 'Test Certificate - Expires in 30 Days',
      category: 'Certificate',
      type: 'Safety Certificate',
      description: 'Test document for 30-day expiry reminder',
      customer: {
        customer_id: 'test-customer-123'
      },
      metadata: {
        expiry_date: expiryDate30.toISOString().split('T')[0]
      },
      created_by: 'test-user@example.com',
      approval_config: {
        enabled: true,
        approvers: [
          {
            user_id: 'approver1',
            user_name: 'Approver One',
            user_email: 'approver1@example.com'
          }
        ]
      },
      file: {
        file_meta: {
          file_name: 'test-cert-30.pdf',
          file_size: 1024000,
          file_type: 'application/pdf',
          file_extension: '.pdf',
          version: '1.0'
        }
      }
    });

    await doc30Days.save();
    testDocs.push(doc30Days);
    console.log(`✓ Created: ${doc30Days.name} (expires ${expiryDate30.toISOString().split('T')[0]})`);

    // 2. Document expiring in 7 days
    const expiryDate7 = new Date(today);
    expiryDate7.setDate(today.getDate() + 7);

    const doc7Days = new Document({
      name: 'Test Compliance Report - Expires in 7 Days',
      category: 'Compliance',
      type: 'Compliance Report',
      description: 'Test document for 7-day expiry reminder',
      customer: {
        customer_id: 'test-customer-123'
      },
      metadata: {
        expiry_date: expiryDate7.toISOString().split('T')[0]
      },
      created_by: 'test-user@example.com',
      approval_config: {
        enabled: true,
        approvers: [
          {
            user_id: 'approver2',
            user_name: 'Approver Two',
            user_email: 'approver2@example.com'
          }
        ]
      },
      file: {
        file_meta: {
          file_name: 'test-compliance-7.pdf',
          file_size: 2048000,
          file_type: 'application/pdf',
          file_extension: '.pdf',
          version: '1.0'
        }
      }
    });

    await doc7Days.save();
    testDocs.push(doc7Days);
    console.log(`✓ Created: ${doc7Days.name} (expires ${expiryDate7.toISOString().split('T')[0]})`);

    // 3. Document expiring in 1 day
    const expiryDate1 = new Date(today);
    expiryDate1.setDate(today.getDate() + 1);

    const doc1Day = new Document({
      name: 'Test Permit - Expires Tomorrow',
      category: 'Permit',
      type: 'Building Permit',
      description: 'Test document for 1-day expiry reminder (urgent)',
      customer: {
        customer_id: 'test-customer-123'
      },
      metadata: {
        expiry_date: expiryDate1.toISOString().split('T')[0]
      },
      created_by: 'test-user@example.com',
      approval_config: {
        enabled: true,
        approvers: [
          {
            user_id: 'approver3',
            user_name: 'Approver Three',
            user_email: 'approver3@example.com'
          }
        ]
      },
      file: {
        file_meta: {
          file_name: 'test-permit-1.pdf',
          file_size: 512000,
          file_type: 'application/pdf',
          file_extension: '.pdf',
          version: '1.0'
        }
      }
    });

    await doc1Day.save();
    testDocs.push(doc1Day);
    console.log(`✓ Created: ${doc1Day.name} (expires ${expiryDate1.toISOString().split('T')[0]})`);

    // 4. Service Report - Due in 5 days (review_date 2 days ago, weekly frequency)
    const reviewDate = new Date(today);
    reviewDate.setDate(today.getDate() - 2);

    const serviceReport = new Document({
      name: 'Weekly HVAC Inspection Report',
      category: 'Service Report',
      type: 'Inspection',
      description: 'Test service report - should be due in 5 days',
      customer: {
        customer_id: 'test-customer-123'
      },
      metadata: {
        review_date: reviewDate.toISOString().split('T')[0],
        frequency: 'weekly'
      },
      created_by: 'test-user@example.com',
      approval_config: {
        enabled: true,
        approvers: [
          {
            user_id: 'service-manager',
            user_name: 'Service Manager',
            user_email: 'service@example.com'
          }
        ]
      },
      file: {
        file_meta: {
          file_name: 'test-service-weekly.pdf',
          file_size: 1536000,
          file_type: 'application/pdf',
          file_extension: '.pdf',
          version: '1.0'
        }
      }
    });

    await serviceReport.save();
    testDocs.push(serviceReport);
    console.log(`✓ Created: ${serviceReport.name} (reviewed ${reviewDate.toISOString().split('T')[0]}, frequency: weekly)`);

    // 5. Overdue Service Report (review_date 10 days ago, weekly frequency)
    const overdueReviewDate = new Date(today);
    overdueReviewDate.setDate(today.getDate() - 10);

    const overdueReport = new Document({
      name: 'Overdue Monthly Safety Report',
      category: 'Safety Report',
      type: 'Safety',
      description: 'Test service report - should be overdue',
      customer: {
        customer_id: 'test-customer-123'
      },
      metadata: {
        review_date: overdueReviewDate.toISOString().split('T')[0],
        frequency: 'weekly'
      },
      created_by: 'test-user@example.com',
      approval_config: {
        enabled: true,
        approvers: [
          {
            user_id: 'safety-manager',
            user_name: 'Safety Manager',
            user_email: 'safety@example.com'
          }
        ]
      },
      file: {
        file_meta: {
          file_name: 'test-service-overdue.pdf',
          file_size: 1024000,
          file_type: 'application/pdf',
          file_extension: '.pdf',
          version: '1.0'
        }
      }
    });

    await overdueReport.save();
    testDocs.push(overdueReport);
    console.log(`✓ Created: ${overdueReport.name} (reviewed ${overdueReviewDate.toISOString().split('T')[0]}, frequency: weekly)`);

    console.log(`\n✓ Created ${testDocs.length} test documents`);
    console.log('\nTest Document IDs:');
    testDocs.forEach(doc => {
      console.log(`  - ${doc._id}: ${doc.name}`);
    });

    console.log('\n✓ Test data created successfully');
    console.log('Run the scheduler to test: npm run check-reminders');

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('Error creating test documents:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createTestDocuments();
