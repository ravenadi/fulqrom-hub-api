require('dotenv').config();
const { sendEmail, verifyConnection } = require('./utils/mailer');

async function testEmail() {
  console.log('Testing SMTP configuration...');
  console.log('SMTP Host:', process.env.MAIL_HOST);
  console.log('SMTP Port:', process.env.MAIL_PORT);
  console.log('From Address:', process.env.MAIL_FROM_ADDRESS);
  console.log('From Name:', process.env.MAIL_FROM_NAME);

  try {
    // Verify connection first
    console.log('\nVerifying SMTP connection...');
    await verifyConnection();
    console.log('✅ SMTP connection verified!\n');

    // Send test email
    console.log('Sending test email...');
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test Email from Fulqrom Hub API',
      html: `
        <html>
          <body>
            <h2>Test Email</h2>
            <p>This is a test email to verify the email configuration.</p>
            <p><strong>Document:</strong> Test Document</p>
            <p><strong>Status:</strong> Pending Approval</p>
            <p><strong>Sent at:</strong> ${new Date().toLocaleString('en-AU')}</p>
          </body>
        </html>
      `
    });

    console.log('\n✅ Email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('\n📬 Check MailHog at: http://localhost:8025/');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Email failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

testEmail();
