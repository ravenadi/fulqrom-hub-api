const nodemailer = require('nodemailer');

/**
 * Create and configure nodemailer transport
 */
const createTransporter = () => {
  const config = {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '465'),
    secure: process.env.MAIL_ENCRYPTION === 'ssl', // true for 465, false for other ports
  };

  // Only add auth if credentials are provided (not null/empty)
  if (process.env.MAIL_USERNAME && process.env.MAIL_USERNAME !== 'null' &&
      process.env.MAIL_PASSWORD && process.env.MAIL_PASSWORD !== 'null') {
    config.auth = {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    };
  }

  return nodemailer.createTransport(config);
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email address(es)
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {string} [options.from] - Sender address (optional, uses default from .env)
 * @param {string|string[]} [options.cc] - CC recipients
 * @param {string|string[]} [options.bcc] - BCC recipients
 * @param {Array} [options.attachments] - Email attachments
 * @returns {Promise<Object>} - Mail send result
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: options.from || `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_ADDRESS}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully:', {
      messageId: info.messageId,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Verify SMTP connection
 * @returns {Promise<boolean>} - True if connection is successful
 */
const verifyConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection verification failed:', error);
    throw new Error(`SMTP connection failed: ${error.message}`);
  }
};

module.exports = {
  sendEmail,
  verifyConnection,
  createTransporter,
};
