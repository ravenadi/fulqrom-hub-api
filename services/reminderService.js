const Document = require('../models/Document');
const notificationService = require('../utils/notificationService');

/**
 * Reminder Service
 * Handles document expiry reminders and service report reminders
 */
class ReminderService {
  /**
   * Check for documents with upcoming expiry dates and send reminders
   * @param {Array<number>} daysBefore - Array of days before expiry to send reminders (e.g., [30, 7, 1])
   * @returns {Promise<Object>} Summary of reminders sent
   */
  async sendExpiryReminders(daysBefore = [30, 7, 1]) {
    try {
      const today = new Date();
      const reminders = {
        sent: 0,
        failed: 0,
        documents: []
      };

      for (const days of daysBefore) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + days);

        // Find documents expiring on target date
        const expiringDocs = await Document.find({
          'metadata.expiry_date': {
            $gte: targetDate.toISOString().split('T')[0], // Start of target date
            $lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // End of target date
          }
        }).lean();

        console.log(`Found ${expiringDocs.length} documents expiring in ${days} days`);

        for (const doc of expiringDocs) {
          try {
            // Determine who to notify
            const recipients = this.getDocumentRecipients(doc);

            if (recipients.length === 0) {
              console.log(`No recipients found for document ${doc._id}`);
              continue;
            }

            // Calculate urgency based on days until expiry
            let priority = 'medium';
            if (days <= 1) priority = 'urgent';
            else if (days <= 7) priority = 'high';

            // Send notifications to all recipients
            await notificationService.sendBulkNotifications(
              recipients,
              {
                title: `Document Expiring in ${days} Day${days !== 1 ? 's' : ''}`,
                message: `Document "${doc.name}" will expire on ${doc.metadata.expiry_date}. Please review and renew if necessary.`,
                type: 'document_expiry_reminder',
                priority,
                documentId: doc._id,
                documentName: doc.name,
                metadata: {
                  expiry_date: doc.metadata.expiry_date,
                  days_until_expiry: days
                },
                building: doc.location?.building?.building_name || '',
                customer: doc.customer?.customer_name || '',
                actionUrl: `/hub/documents/${doc._id}`,
                sendEmail: true,
                emailTemplate: 'document_update',
                emailVariables: {
                  creator_name: 'User',
                  document_name: doc.name,
                  document_category: doc.category || 'N/A',
                  document_type: doc.type || 'N/A',
                  document_id: doc._id,
                  new_status: `Expires in ${days} day${days !== 1 ? 's' : ''}`,
                  status_class: priority === 'urgent' ? 'rejected' : priority === 'high' ? 'pending' : 'approved',
                  reviewer_name: 'System Reminder',
                  review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                  comment: `This document will expire in ${days} day${days !== 1 ? 's' : ''} on ${doc.metadata.expiry_date}. Please review and renew if necessary.`,
                  document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/hub/documents/${doc._id}`
                }
              }
            );

            reminders.sent++;
            reminders.documents.push({
              id: doc._id,
              name: doc.name,
              expiry_date: doc.metadata.expiry_date,
              days_until_expiry: days,
              recipients_count: recipients.length
            });
          } catch (error) {
            console.error(`Failed to send expiry reminder for document ${doc._id}:`, error);
            reminders.failed++;
          }
        }
      }

      console.log(`Expiry reminders summary: ${reminders.sent} sent, ${reminders.failed} failed`);
      return reminders;
    } catch (error) {
      console.error('Error sending expiry reminders:', error);
      throw error;
    }
  }

  /**
   * Check for service reports due for review and send reminders
   * @returns {Promise<Object>} Summary of reminders sent
   */
  async sendServiceReportReminders() {
    try {
      const today = new Date();
      const reminders = {
        sent: 0,
        failed: 0,
        documents: []
      };

      // Find documents where category contains "report" and have a frequency set
      const serviceReports = await Document.find({
        category: { $regex: /report/i },
        'metadata.frequency': { $exists: true, $ne: null }
      }).lean();

      console.log(`Found ${serviceReports.length} service reports to check`);

      for (const doc of serviceReports) {
        try {
          // Calculate next service date based on frequency and review_date
          const nextServiceDate = this.calculateNextServiceDate(
            doc.metadata.review_date,
            doc.metadata.frequency
          );

          if (!nextServiceDate) {
            console.log(`Cannot calculate next service date for document ${doc._id}`);
            continue;
          }

          // Check if service is due (within 7 days) or overdue
          const daysUntilDue = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));

          // Send reminder if due within 7 days or overdue
          if (daysUntilDue <= 7) {
            const recipients = this.getDocumentRecipients(doc);

            if (recipients.length === 0) {
              console.log(`No recipients found for service report ${doc._id}`);
              continue;
            }

            // Determine priority and message
            let priority = 'medium';
            let title = '';
            let message = '';

            if (daysUntilDue < 0) {
              priority = 'urgent';
              title = 'Service Report Overdue';
              message = `Service report "${doc.name}" is ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''} overdue. Please complete and submit immediately.`;
            } else if (daysUntilDue === 0) {
              priority = 'urgent';
              title = 'Service Report Due Today';
              message = `Service report "${doc.name}" is due today. Please complete and submit.`;
            } else {
              priority = daysUntilDue <= 3 ? 'high' : 'medium';
              title = `Service Report Due in ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''}`;
              message = `Service report "${doc.name}" is due on ${nextServiceDate.toISOString().split('T')[0]}. Please prepare and submit on time.`;
            }

            // Send notifications to all recipients
            await notificationService.sendBulkNotifications(
              recipients,
              {
                title,
                message,
                type: 'service_report_reminder',
                priority,
                documentId: doc._id,
                documentName: doc.name,
                metadata: {
                  next_service_date: nextServiceDate.toISOString().split('T')[0],
                  frequency: doc.metadata.frequency,
                  days_until_due: daysUntilDue,
                  is_overdue: daysUntilDue < 0
                },
                building: doc.location?.building?.building_name || '',
                customer: doc.customer?.customer_name || '',
                actionUrl: `/hub/documents/${doc._id}`,
                sendEmail: true,
                emailTemplate: 'document_update',
                emailVariables: {
                  creator_name: 'User',
                  document_name: doc.name,
                  document_category: doc.category || 'Service Report',
                  document_type: doc.type || 'N/A',
                  document_id: doc._id,
                  new_status: daysUntilDue < 0 ? `Overdue (${Math.abs(daysUntilDue)} days)` : daysUntilDue === 0 ? 'Due Today' : `Due in ${daysUntilDue} days`,
                  status_class: daysUntilDue < 0 ? 'rejected' : daysUntilDue <= 3 ? 'pending' : 'approved',
                  reviewer_name: 'System Reminder',
                  review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                  comment: message,
                  document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/hub/documents/${doc._id}`
                }
              }
            );

            reminders.sent++;
            reminders.documents.push({
              id: doc._id,
              name: doc.name,
              next_service_date: nextServiceDate.toISOString().split('T')[0],
              frequency: doc.metadata.frequency,
              days_until_due: daysUntilDue,
              recipients_count: recipients.length
            });
          }
        } catch (error) {
          console.error(`Failed to send service report reminder for document ${doc._id}:`, error);
          reminders.failed++;
        }
      }

      console.log(`Service report reminders summary: ${reminders.sent} sent, ${reminders.failed} failed`);
      return reminders;
    } catch (error) {
      console.error('Error sending service report reminders:', error);
      throw error;
    }
  }

  /**
   * Calculate next service date based on review date and frequency
   * @param {string} reviewDate - Last review date
   * @param {string} frequency - Frequency: weekly, monthly, quarterly, annual
   * @returns {Date|null} Next service date
   */
  calculateNextServiceDate(reviewDate, frequency) {
    if (!reviewDate || !frequency) {
      return null;
    }

    const lastReview = new Date(reviewDate);
    if (isNaN(lastReview.getTime())) {
      return null;
    }

    const nextDate = new Date(lastReview);

    switch (frequency.toLowerCase()) {
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        return null;
    }

    return nextDate;
  }

  /**
   * Get recipients for a document (approvers, creator, etc.)
   * @param {Object} document - Document object
   * @returns {Array} Array of recipients with user_id and user_email
   */
  getDocumentRecipients(document) {
    const recipients = [];
    const seenEmails = new Set();

    // Add document creator
    if (document.created_by) {
      const email = document.created_by;
      if (!seenEmails.has(email)) {
        recipients.push({
          user_id: document.created_by,
          user_email: email
        });
        seenEmails.add(email);
      }
    }

    // Add approvers from approval_config
    if (document.approval_config && document.approval_config.approvers) {
      document.approval_config.approvers.forEach(approver => {
        if (approver.user_email && !seenEmails.has(approver.user_email)) {
          recipients.push({
            user_id: approver.user_id || approver.user_email,
            user_email: approver.user_email
          });
          seenEmails.add(approver.user_email);
        }
      });
    }

    // Add legacy approved_by field
    if (document.approved_by && !seenEmails.has(document.approved_by)) {
      recipients.push({
        user_id: document.approved_by,
        user_email: document.approved_by
      });
      seenEmails.add(document.approved_by);
    }

    return recipients;
  }
}

module.exports = new ReminderService();
