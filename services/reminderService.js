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
      // Set to start of today (midnight)
      today.setHours(0, 0, 0, 0);
      
      const reminders = {
        sent: 0,
        failed: 0,
        documents: []
      };

      for (const days of daysBefore) {
        // Calculate target date (X days from today)
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + days);
        
        // Format target date as YYYY-MM-DD for comparison
        const targetDateStr = targetDate.toISOString().split('T')[0];
        
        // Escape special regex characters in the date string
        const escapedDate = targetDateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Find documents with expiry_date matching the target date
        // Handle both YYYY-MM-DD format and ISO date strings (YYYY-MM-DDTHH:mm:ss.sssZ)
        // Check both root level expiry_date and metadata.expiry_date for backward compatibility
        // Use regex to match dates that start with the target date string
        const expiringDocs = await Document.find({
          $or: [
            // Exact match for YYYY-MM-DD format
            { expiry_date: targetDateStr },
            // Regex match for dates starting with YYYY-MM-DD (handles ISO strings)
            { expiry_date: { $regex: `^${escapedDate}` } },
            // Same for metadata.expiry_date
            { 'metadata.expiry_date': targetDateStr },
            { 'metadata.expiry_date': { $regex: `^${escapedDate}` } }
          ]
        }).lean();

        console.log(`Checking for documents expiring in ${days} days (target date: ${targetDateStr})`);
        console.log(`Found ${expiringDocs.length} documents expiring on ${targetDateStr}`);

        for (const doc of expiringDocs) {
          try {
            // Get expiry date from root level or metadata (backward compatibility)
            let expiryDate = doc.expiry_date || doc.metadata?.expiry_date;
            
            if (!expiryDate) {
              console.log(`Document ${doc._id} has no expiry date, skipping`);
              continue;
            }

            // Normalize expiry date to YYYY-MM-DD format for comparison
            let normalizedExpiryDate = expiryDate;
            if (expiryDate.includes('T')) {
              // It's an ISO string, extract just the date part
              normalizedExpiryDate = expiryDate.split('T')[0];
            } else if (expiryDate.includes(' ')) {
              // It might be a date with time separated by space
              normalizedExpiryDate = expiryDate.split(' ')[0];
            }

            // Verify the normalized expiry date matches our target
            if (normalizedExpiryDate !== targetDateStr) {
              console.log(`Document ${doc._id} expiry date ${expiryDate} (normalized: ${normalizedExpiryDate}) doesn't match target ${targetDateStr}, skipping`);
              continue;
            }

            // Determine who to notify
            const recipients = this.getDocumentRecipients(doc);

            if (recipients.length === 0) {
              console.log(`No recipients found for document ${doc._id} (${doc.name})`);
              continue;
            }

            // Calculate urgency based on days until expiry
            let priority = 'medium';
            if (days <= 1) priority = 'urgent';
            else if (days <= 7) priority = 'high';

            // Use normalized date for display
            const displayExpiryDate = normalizedExpiryDate;

            // Send notifications to all recipients
            await notificationService.sendBulkNotifications(
              recipients,
              {
                title: `Document Expiring in ${days} Day${days !== 1 ? 's' : ''}`,
                message: `Document "${doc.name}" will expire on ${displayExpiryDate}. Please review and renew if necessary.`,
                type: 'document_expiry_reminder',
                priority,
                documentId: doc._id,
                documentName: doc.name,
                tenantId: doc.tenant_id, // Required for multi-tenancy
                metadata: {
                  expiry_date: displayExpiryDate,
                  days_until_expiry: days
                },
                building: doc.location?.building?.building_name || '',
                customer: doc.customer?.customer_name || '',
                actionUrl: `/hub/document/${doc._id}/review`,
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
                  comment: `This document will expire in ${days} day${days !== 1 ? 's' : ''} on ${displayExpiryDate}. Please review and renew if necessary.`,
                  document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/hub/document/${doc._id}/review`
                }
              }
            );

            reminders.sent++;
            reminders.documents.push({
              id: doc._id,
              name: doc.name,
              expiry_date: displayExpiryDate,
              days_until_expiry: days,
              recipients_count: recipients.length
            });
            
            console.log(`✓ Sent expiry reminder for document "${doc.name}" to ${recipients.length} recipient(s)`);
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
                actionUrl: `/hub/document/${doc._id}/review`,
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
                  document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/hub/document/${doc._id}/review`
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

    // Add document creator (created_by is an object with user_id, user_name, email)
    if (document.created_by) {
      let email, userId;
      
      // Handle both object format {user_id, user_name, email} and string format (backward compatibility)
      if (typeof document.created_by === 'object') {
        email = document.created_by.email || document.created_by.user_email;
        userId = document.created_by.user_id || email;
      } else {
        // Legacy: created_by was a simple email string
        email = document.created_by;
        userId = email;
      }
      
      if (email && !seenEmails.has(email)) {
        recipients.push({
          user_id: userId,
          user_email: email
        });
        seenEmails.add(email);
      }
    }

    // Add approvers from approval_config
    if (document.approval_config && document.approval_config.approvers) {
      document.approval_config.approvers.forEach(approver => {
        // Support both 'email' and 'user_email' field names
        const approverEmail = approver.user_email || approver.email;
        if (approverEmail && !seenEmails.has(approverEmail)) {
          recipients.push({
            user_id: approver.user_id || approverEmail,
            user_email: approverEmail
          });
          seenEmails.add(approverEmail);
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
