require('dotenv').config();
const emailService = require('./utils/emailService');

async function testEmail() {
  console.log('Testing email service...');
  console.log('Email Provider:', process.env.EMAIL_PROVIDER);
  console.log('SMTP Host:', process.env.MAIL_HOST);
  console.log('SMTP Port:', process.env.MAIL_PORT);
  console.log('From Address:', process.env.MAIL_FROM_ADDRESS || process.env.MAIL_FROM_ADDRESS);
  console.log('From Name:', process.env.MAIL_FROM_NAME || process.env.MAIL_FROM_NAME);
  console.log('\nSending test email...\n');

  try {
    const result = await emailService.sendDocumentAssignment({
      to: 'test@example.com',
      documentId: '507f1f77bcf86cd799439011',
      approverName: 'Test Approver',
      documentDetails: {
        name: 'Test Document',
        category: 'Test Category',
        type: 'PDF',
        status: 'Pending Approval',
        uploadedBy: 'Test User',
        uploadedDate: new Date(),
        description: 'This is a test document for email verification'
      }
    });

    console.log('\n✅ Email sent successfully!');
    console.log('Result:', result);
    console.log('\nCheck MailHog at: http://localhost:8025/');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Email failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

testEmail();
