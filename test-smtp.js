require('dotenv').config();
const { sendEmail, verifyConnection } = require('./utils/mailer');

// Override environment variables with Gmail SMTP settings
process.env.MAIL_HOST = 'smtp.gmail.com';
process.env.MAIL_PORT = '587';
process.env.MAIL_USERNAME = 'ben@ravenlabs.biz';
process.env.MAIL_PASSWORD = 'IH$jV*67^SSVVoRh';
process.env.MAIL_ENCRYPTION = 'tls';
process.env.MAIL_FROM_ADDRESS = 'ben@ravenlabs.biz';
process.env.MAIL_FROM_NAME = 'Fulqrom Hub Test';


// process.env.MAIL_PROVIDER='smtp';
// process.env.MAIL_MAILER='smtp';
// process.env.MAIL_HOST='smtppro.zoho.com';
// process.env.MAIL_PORT='465';
// process.env.MAIL_USERNAME='sdeven@gkblabs.com';
// process.env.MAIL_PASSWORD='GKB@Labs@123456';
// process.env.MAIL_ENCRYPTION='ssl';
// process.env.MAIL_FROM_ADDRESS='sdeven@gkblabs.com';
// process.env.MAIL_FROM_NAME='Fulqrom Hub';




async function testSMTPConnection() {
  console.log('==================================================');
  console.log('          SMTP Configuration Test');
  console.log('==================================================\n');

  try {
    // Step 1: Verify SMTP connection
    console.log('Step 1: Verifying SMTP connection...');
    await verifyConnection();
    console.log('✓ SMTP connection verified successfully!\n');

    // Step 2: Send test email
    console.log('Step 2: Sending test email...');
    const result = await sendEmail({
      to: 'sdeven@gkblabs.com',
      subject: `SMTP Test - Fulqrom Hub - ${new Date().toLocaleString('en-AU')}`,
      text: 'This is a test email from Fulqrom Hub to verify SMTP configuration.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #2563eb;">SMTP Configuration Test</h2>
          <p>This is a test email from Fulqrom Hub to verify SMTP configuration.</p>

          <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Test Details:</h3>
            <p><strong>Test Date:</strong> ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
            <p><strong>SMTP Server:</strong> smtp.gmail.com</p>
            <p><strong>Port:</strong> 587 (TLS)</p>
            <p><strong>From:</strong> ben@ravenlabs.biz</p>
          </div>

          <p style="color: #16a34a; font-weight: bold;">✓ If you received this email, your SMTP configuration is working correctly!</p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            Sent from Fulqrom Hub - Australian Commercial Real Estate & Building Management Platform
          </p>
        </div>
      `
    });

    console.log('✓ Test email sent successfully!\n');
    console.log('==================================================');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
    console.log('==================================================\n');
    console.log('✓✓✓ SMTP CONFIGURATION IS WORKING CORRECTLY! ✓✓✓\n');
    console.log('Check the inbox for ben@ravenlabs.biz');
    console.log('==================================================\n');

  } catch (error) {
    console.error('\n==================================================');
    console.error('✗ SMTP TEST FAILED');
    console.error('==================================================\n');
    console.error('Error:', error.message);

    if (error.message.includes('EAUTH')) {
      console.error('\n❌ Authentication Failed\n');
      console.error('Possible reasons:');
      console.error('  1. Incorrect username or password');
      console.error('  2. App-specific password required (if 2FA is enabled)');
      console.error('  3. "Less secure app access" needs to be enabled');
      console.error('  4. Account requires additional verification\n');
    } else if (error.message.includes('ESOCKET') || error.message.includes('ETIMEDOUT')) {
      console.error('\n❌ Connection Failed\n');
      console.error('Possible reasons:');
      console.error('  1. No internet connection');
      console.error('  2. Firewall blocking port 587');
      console.error('  3. Incorrect SMTP server or port\n');
    }

    console.error('==================================================\n');
    process.exit(1);
  }
}

testSMTPConnection();
