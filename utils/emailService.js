const fs = require('fs').promises;
const path = require('path');
const EmailNotification = require('../models/EmailNotification');
const { formatAustralianDate, formatAustralianDateTime } = require('./dateFormatter');

/**
 * Email Service for sending document approval notifications
 * Supports SendGrid, AWS SES, or console logging for development
 */
class EmailService {
  constructor() {
    this.provider = process.env.MAIL_PROVIDER || 'console';
    this.fromAddress = process.env.MAIL_FROM_ADDRESS || 'noreply@fulqrom.com';
    this.fromName = process.env.MAIL_FROM_NAME || 'Fulqrom Hub';
    this.appBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Initialize email provider
    this.initializeProvider();
  }

  /**
   * Initialize email provider (SMTP, SendGrid, AWS SES, etc.)
   */
  initializeProvider() {
    if (this.provider === 'smtp') {
      try {
        const { createTransporter } = require('./mailer');
        this.client = createTransporter();
        console.log('✓ SMTP email provider initialized');
      } catch (error) {
        console.warn('⚠ SMTP not available, falling back to console logging');
        this.provider = 'console';
      }
    } else if (this.provider === 'sendgrid') {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.client = sgMail;
        console.log('✓ SendGrid email provider initialized');
      } catch (error) {
        console.warn('⚠ SendGrid not available, falling back to console logging');
        this.provider = 'console';
      }
    } else if (this.provider === 'ses') {
      try {
        const { SESClient } = require('@aws-sdk/client-ses');
        this.client = new SESClient({
          region: process.env.AWS_REGION || 'ap-southeast-2' // Sydney
        });
        console.log('✓ AWS SES email provider initialized');
      } catch (error) {
        console.warn('⚠ AWS SES not available, falling back to console logging');
        this.provider = 'console';
      }
    } else {
      console.log('ℹ Email provider set to console logging (development mode)');
    }
  }

  /**
   * Load and render HTML email template
   * @param {string} templateName - Template name (document_assignment, document_update)
   * @param {Object} variables - Template variables
   * @returns {Promise<{subject: string, html: string}>}
   */
  async renderTemplate(templateName, variables) {
    try {
      // Map snake_case template names to camelCase file names
      const templateFileMap = {
        'document_assignment': 'documentAssignment',
        'document_update': 'documentUpdate'
      };

      const fileName = templateFileMap[templateName] || templateName;

      // Load template file
      const templatePath = path.join(__dirname, 'emailTemplates', `${fileName}.html`);
      let html = await fs.readFile(templatePath, 'utf8');

      // Generate subject based on template
      const subjects = {
        document_assignment: `Document Approval Request - ${variables.document_name}`,
        documentAssignment: `Document Approval Request - ${variables.document_name}`,
        document_update: `New comment on the document - ${variables.document_name}`,
        documentUpdate: `New comment on the document - ${variables.document_name}`
      };

      const subject = subjects[templateName] || 'Fulqrom Hub Notification';

      // Handle conditional blocks FIRST (before variable replacement)
      // Process nested {{#if}} blocks from innermost to outermost
      // Keep processing until no more conditionals are found
      let previousHtml;
      let iterations = 0;
      const maxIterations = 10; // Prevent infinite loops

      do {
        previousHtml = html;
        html = html.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, varName, content) => {
          const value = variables[varName];
          // Check if value exists and is not empty/falsy
          // For strings, check if not empty after trimming
          if (value !== null && value !== undefined && value !== false) {
            if (typeof value === 'string') {
              return value.trim() !== '' ? content : '';
            }
            return value ? content : '';
          }
          return '';
        });
        iterations++;
      } while (previousHtml !== html && iterations < maxIterations);

      // Replace variables in template
      // Simple template engine - replace {{variable}} with value
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, value || '');
      }

      return { subject, html };
    } catch (error) {
      console.error('Error rendering email template:', error);
      throw new Error(`Failed to render email template: ${error.message}`);
    }
  }

  /**
   * Send email via configured provider
   * @param {Object} params - Email parameters
   * @param {string} params.template - Template name
   * @param {string} params.to - Recipient email
   * @param {Object} params.variables - Template variables
   * @param {string} params.documentId - Document ID (optional)
   * @returns {Promise<Object>}
   */
  async sendEmail({ template, to, variables, documentId }) {
    // Create email notification record (pending)
    const notification = new EmailNotification({
      template,
      to: to.toLowerCase().trim(),
      subject: '', // Will be updated after rendering
      variables,
      document_id: documentId,
      status: 'pending',
      email_provider: this.provider
    });

    try {
      // Render template
      const { subject, html } = await this.renderTemplate(template, variables);

      // Update notification with subject
      notification.subject = subject;

      // Send email based on provider
      let result;
      if (this.provider === 'smtp') {
        result = await this.sendViaSMTP({ to, subject, html });
      } else if (this.provider === 'sendgrid') {
        result = await this.sendViaSendGrid({ to, subject, html });
      } else if (this.provider === 'ses') {
        result = await this.sendViaSES({ to, subject, html });
      } else {
        // Console logging (development)
        result = await this.sendViaConsole({ to, subject, html });
      }

      // Mark as sent
      await notification.markAsSent(result.messageId);

      console.log(`✓ Email sent to ${to}: ${subject}`);

      return {
        success: true,
        messageId: result.messageId,
        notificationId: notification._id
      };

    } catch (error) {
      // Mark as failed
      await notification.markAsFailed(error.message);

      console.error(`✗ Failed to send email to ${to}:`, error);

      // Don't throw - email failures should not break app flow
      return {
        success: false,
        error: error.message,
        notificationId: notification._id
      };
    }
  }

  /**
   * Send email via SMTP (nodemailer)
   */
  async sendViaSMTP({ to, subject, html }) {
    const info = await this.client.sendMail({
      from: `${this.fromName} <${this.fromAddress}>`,
      to,
      subject,
      html
    });

    return {
      messageId: info.messageId || 'smtp-' + Date.now()
    };
  }

  /**
   * Send email via SendGrid
   */
  async sendViaSendGrid({ to, subject, html }) {
    const msg = {
      to,
      from: {
        email: this.fromAddress,
        name: this.fromName
      },
      subject,
      html
    };

    const [response] = await this.client.send(msg);

    return {
      messageId: response.headers['x-message-id'] || 'sendgrid-' + Date.now()
    };
  }

  /**
   * Send email via AWS SES
   */
  async sendViaSES({ to, subject, html }) {
    const { SendEmailCommand } = require('@aws-sdk/client-ses');

    const params = {
      Source: `${this.fromName} <${this.fromAddress}>`,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8'
          }
        }
      }
    };

    const command = new SendEmailCommand(params);
    const response = await this.client.send(command);

    return {
      messageId: response.MessageId
    };
  }

  /**
   * Log email to console (development mode)
   */
  async sendViaConsole({ to, subject, html }) {
    console.log('\n' + '='.repeat(80));
    console.log('📧 EMAIL (CONSOLE MODE - DEVELOPMENT ONLY)');
    console.log('='.repeat(80));
    console.log(`To: ${to}`);
    console.log(`From: ${this.fromName} <${this.fromAddress}>`);
    console.log(`Subject: ${subject}`);
    console.log('-'.repeat(80));
    console.log(html.substring(0, 500) + '...');
    console.log('='.repeat(80) + '\n');

    return {
      messageId: 'console-' + Date.now()
    };
  }

  /**
   * Send document assignment notification
   * @param {Object} params - Notification parameters
   */
  async sendDocumentAssignment(params) {
    const {
      to,
      documentId,
      approverName,
      documentDetails
    } = params;

    const variables = {
      approver_name: approverName,
      document_name: documentDetails.name,
      document_category: documentDetails.category || 'N/A',
      document_type: documentDetails.type || 'N/A',
      approval_status: documentDetails.status || 'Pending Approval',
      uploaded_by_name: documentDetails.uploadedBy || 'Unknown',
      uploaded_date_formatted: formatAustralianDate(documentDetails.uploadedDate),
      document_description: documentDetails.description || '',
      document_review_url: `${this.appBaseUrl}/documents/${documentId}/review`
    };

    return this.sendEmail({
      template: 'document_assignment',
      to,
      variables,
      documentId
    });
  }

  /**
   * Send document update notification
   * @param {Object} params - Notification parameters
   */
  async sendDocumentUpdate(params) {
    const {
      to,
      documentId,
      creatorName,
      documentDetails,
      statusUpdate
    } = params;

    // Determine status class for badge styling
    const statusClass = statusUpdate.newStatus.toLowerCase().includes('approved') ? 'approved' :
                       statusUpdate.newStatus.toLowerCase().includes('rejected') ? 'rejected' :
                       'pending';

    // Format mentioned users list
    const mentionedUsersList = statusUpdate.mentionedUsers && statusUpdate.mentionedUsers.length > 0
      ? statusUpdate.mentionedUsers.map(u => u.user_name).join(', ')
      : '';

    const variables = {
      creator_name: creatorName,
      document_name: documentDetails.name,
      document_category: documentDetails.category || 'N/A',
      document_type: documentDetails.type || 'N/A',
      new_status: statusUpdate.newStatus,
      old_status: statusUpdate.oldStatus || '',
      status_changed: !!statusUpdate.oldStatus,
      status_class: statusClass,
      reviewer_name: statusUpdate.reviewerName,
      review_date_formatted: formatAustralianDateTime(statusUpdate.reviewDate),
      comment: statusUpdate.comment || '',
      mentioned_users_list: mentionedUsersList,
      document_url: `${this.appBaseUrl}/documents/${documentId}/overview`
    };

    return this.sendEmail({
      template: 'document_update',
      to,
      variables,
      documentId
    });
  }

  /**
   * Retry failed emails (for background job)
   * @param {number} maxRetries - Maximum retry count
   * @returns {Promise<Object>}
   */
  async retryFailedEmails(maxRetries = 3) {
    const failedEmails = await EmailNotification.getFailedEmailsForRetry(maxRetries);

    let successCount = 0;
    let failedCount = 0;

    for (const notification of failedEmails) {
      try {
        const result = await this.sendEmail({
          template: notification.template,
          to: notification.to,
          variables: notification.variables,
          documentId: notification.document_id
        });

        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        failedCount++;
        console.error(`Retry failed for email ${notification._id}:`, error);
      }
    }

    return {
      totalProcessed: failedEmails.length,
      successCount,
      failedCount
    };
  }
}

// Export singleton instance
module.exports = new EmailService();
