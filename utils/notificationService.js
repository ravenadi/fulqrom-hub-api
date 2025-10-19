const Notification = require('../models/Notification');
const emailService = require('./emailService');

/**
 * Notification Service
 * Handles both in-app notifications and email notifications
 */
class NotificationService {
  /**
   * Send a notification to a single user
   * @param {Object} params - Notification parameters
   * @param {string} params.userId - User ID
   * @param {string} params.userEmail - User email
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification message
   * @param {string} params.type - Notification type
   * @param {string} [params.priority='medium'] - Priority level (low, medium, high, urgent)
   * @param {string} [params.documentId] - Related document ID
   * @param {string} [params.documentName] - Related document name
   * @param {string} [params.commentId] - Related comment ID
   * @param {Object} [params.actor] - Actor who triggered the notification
   * @param {Object} [params.metadata={}] - Additional metadata
   * @param {string} [params.building] - Building name
   * @param {string} [params.customer] - Customer name
   * @param {string} [params.actionUrl] - URL to navigate when clicked
   * @param {boolean} [params.sendEmail=false] - Whether to send email notification
   * @param {string} [params.emailTemplate] - Email template to use
   * @param {Object} [params.emailVariables={}] - Email template variables
   * @returns {Promise<Object>} Created notification
   */
  async sendNotification({
    userId,
    userEmail,
    title,
    message,
    type,
    priority = 'medium',
    documentId = null,
    documentName = null,
    commentId = null,
    actor = null,
    metadata = {},
    building = null,
    customer = null,
    actionUrl = null,
    sendEmail = false,
    emailTemplate = null,
    emailVariables = {}
  }) {
    try {
      // Create in-app notification
      const notification = await Notification.create({
        user_id: userId,
        user_email: userEmail,
        title,
        message,
        type,
        priority,
        document_id: documentId,
        document_name: documentName,
        comment_id: commentId,
        actor,
        metadata,
        building,
        customer,
        action_url: actionUrl,
        is_read: false
      });

      // Send email notification if requested
      if (sendEmail && emailTemplate && userEmail) {
        try {
          notification.email_status = 'pending';
          await notification.save();

          const emailResult = await emailService.sendEmail({
            template: emailTemplate,
            to: userEmail,
            variables: emailVariables,
            documentId
          });

          // Update notification with email status
          if (emailResult.success) {
            notification.email_sent = true;
            notification.email_status = 'sent';
            notification.email_provider_id = emailResult.messageId;
            notification.email_sent_at = new Date();
          } else {
            notification.email_status = 'failed';
            notification.email_error = emailResult.error;
          }
          await notification.save();
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          notification.email_status = 'failed';
          notification.email_error = emailError.message;
          await notification.save();
          // Continue even if email fails - in-app notification is created
        }
      }

      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Send notifications to multiple users
   * @param {Array<Object>} users - Array of user objects with userId and userEmail
   * @param {Object} notificationData - Notification data (same as sendNotification params)
   * @returns {Promise<Array>} Array of created notifications
   */
  async sendBulkNotifications(users, notificationData) {
    const notifications = [];

    for (const user of users) {
      try {
        const userId = user.userId || user.user_id;
        const userEmail = user.userEmail || user.user_email;

        const notification = await this.sendNotification({
          ...notificationData,
          userId: userId,
          userEmail: userEmail
        });
        notifications.push(notification);
      } catch (error) {
        console.error(`Failed to send notification to user ${user.userId || user.user_id}:`, error);
        // Continue with other users even if one fails
      }
    }

    return notifications;
  }

  /**
   * Notify document approvers when assigned
   * @param {Object} document - Document object
   * @param {Array} approvers - Array of approver objects
   * @param {Object} actor - User who assigned the approvers
   * @returns {Promise<Array>} Array of created notifications
   */
  async notifyDocumentApproversAssigned(document, approvers, actor) {
    const documentId = document._id || document.id;
    const documentName = document.name || 'Unnamed Document';
    const actionUrl = `/hub/documents/${documentId}`;

    const notificationData = {
      title: 'Document Approval Request',
      message: `You have been assigned to approve the document "${documentName}"`,
      type: 'document_approver_assigned',
      priority: 'high',
      documentId,
      documentName,
      actor: {
        user_id: actor.userId || actor.user_id,
        user_name: actor.userName || actor.user_name,
        user_email: actor.userEmail || actor.user_email
      },
      actionUrl,
      sendEmail: true,
      emailTemplate: 'document_assignment',
      emailVariables: {
        document_name: documentName,
        document_id: documentId,
        assigned_by: actor.userName || actor.user_name,
        action_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}${actionUrl}`
      }
    };

    return this.sendBulkNotifications(approvers, notificationData);
  }

  /**
   * Notify when document status changes
   * @param {Object} document - Document object
   * @param {Object} oldStatus - Old status value
   * @param {Object} newStatus - New status value
   * @param {Array} recipients - Array of user objects to notify
   * @param {Object} actor - User who changed the status
   * @returns {Promise<Array>} Array of created notifications
   */
  async notifyDocumentStatusChanged(document, oldStatus, newStatus, recipients, actor) {
    const documentId = document._id || document.id;
    const documentName = document.name || 'Unnamed Document';
    const actionUrl = `/hub/documents/${documentId}`;

    const notificationData = {
      title: 'Document Status Changed',
      message: `Document "${documentName}" status changed from "${oldStatus}" to "${newStatus}"`,
      type: 'document_status_changed',
      priority: newStatus === 'Approved' ? 'high' : 'medium',
      documentId,
      documentName,
      actor: {
        user_id: actor.userId || actor.user_id,
        user_name: actor.userName || actor.user_name,
        user_email: actor.userEmail || actor.user_email
      },
      metadata: {
        old_status: oldStatus,
        new_status: newStatus
      },
      actionUrl,
      sendEmail: newStatus === 'Approved' || newStatus === 'Rejected',
      emailTemplate: 'document_update',
      emailVariables: {
        creator_name: 'User',
        document_name: documentName,
        document_category: document.category || 'N/A',
        document_type: document.type || 'N/A',
        document_id: documentId,
        new_status: newStatus,
        old_status: oldStatus,
        status_changed: true,
        status_class: newStatus === 'Approved' ? 'approved' : newStatus === 'Rejected' ? 'rejected' : 'pending',
        reviewer_name: actor.userName || actor.user_name,
        review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        comment: `Status changed from "${oldStatus}" to "${newStatus}"`,
        document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}${actionUrl}`
      }
    };

    return this.sendBulkNotifications(recipients, notificationData);
  }

  /**
   * Notify when document approval status changes
   * @param {Object} document - Document object
   * @param {string} approvalStatus - New approval status
   * @param {Array} recipients - Array of user objects to notify
   * @param {Object} actor - User who changed the approval status
   * @returns {Promise<Array>} Array of created notifications
   */
  async notifyDocumentApprovalStatusChanged(document, approvalStatus, recipients, actor) {
    const documentId = document._id || document.id;
    const documentName = document.name || 'Unnamed Document';
    const actionUrl = `/hub/documents/${documentId}`;

    const isApproved = approvalStatus === 'Approved';
    const isRejected = approvalStatus === 'Rejected';

    const notificationData = {
      title: isApproved ? 'Document Approved' : isRejected ? 'Document Rejected' : 'Approval Status Changed',
      message: `Document "${documentName}" has been ${approvalStatus.toLowerCase()} by ${actor.userName || actor.user_name}`,
      type: isApproved ? 'document_approved' : isRejected ? 'document_rejected' : 'document_approval_status_changed',
      priority: 'high',
      documentId,
      documentName,
      actor: {
        user_id: actor.userId || actor.user_id,
        user_name: actor.userName || actor.user_name,
        user_email: actor.userEmail || actor.user_email
      },
      metadata: {
        approval_status: approvalStatus
      },
      actionUrl,
      sendEmail: true,
      emailTemplate: 'document_update',
      emailVariables: {
        creator_name: 'User',
        document_name: documentName,
        document_category: document.category || 'N/A',
        document_type: document.type || 'N/A',
        document_id: documentId,
        new_status: approvalStatus,
        status_class: isApproved ? 'approved' : isRejected ? 'rejected' : 'pending',
        reviewer_name: actor.userName || actor.user_name,
        review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        comment: `Document ${approvalStatus.toLowerCase()} by ${actor.userName || actor.user_name}`,
        document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}${actionUrl}`
      }
    };

    return this.sendBulkNotifications(recipients, notificationData);
  }

  /**
   * Notify when a comment is added to a document
   * @param {Object} document - Document object
   * @param {Object} comment - Comment object
   * @param {Array} recipients - Array of user objects to notify
   * @returns {Promise<Array>} Array of created notifications
   */
  async notifyDocumentCommentAdded(document, comment, recipients) {
    const documentId = document._id || document.id;
    const documentName = document.name || 'Unnamed Document';
    const commentId = comment._id || comment.id;
    const actionUrl = `/hub/documents/${documentId}#comment-${commentId}`;

    const notificationData = {
      title: 'New Comment on Document',
      message: `${comment.user_name} commented on "${documentName}": ${comment.comment.substring(0, 100)}${comment.comment.length > 100 ? '...' : ''}`,
      type: 'document_comment_added',
      priority: 'medium',
      documentId,
      documentName,
      commentId,
      actor: {
        user_id: comment.user_id,
        user_name: comment.user_name,
        user_email: comment.user_email
      },
      metadata: {
        comment_preview: comment.comment.substring(0, 200)
      },
      actionUrl,
      sendEmail: true,
      emailTemplate: 'document_update',
      emailVariables: {
        creator_name: 'User',
        document_name: documentName,
        document_category: document.category || 'N/A',
        document_type: document.type || 'N/A',
        document_id: documentId,
        new_status: 'New Comment Added',
        status_class: 'pending',
        reviewer_name: comment.user_name,
        review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        comment: comment.comment,
        document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}${actionUrl}`
      }
    };

    return this.sendBulkNotifications(recipients, notificationData);
  }

  /**
   * Notify when a new version is uploaded
   * @param {Object} document - Document object
   * @param {string} newVersion - New version number
   * @param {Array} recipients - Array of user objects to notify
   * @param {Object} actor - User who uploaded the new version
   * @returns {Promise<Array>} Array of created notifications
   */
  async notifyDocumentVersionUploaded(document, newVersion, recipients, actor) {
    const documentId = document._id || document.id;
    const documentName = document.name || 'Unnamed Document';
    const actionUrl = `/hub/documents/${documentId}`;

    const notificationData = {
      title: 'New Document Version Uploaded',
      message: `${actor.userName || actor.user_name} uploaded version ${newVersion} of "${documentName}"`,
      type: 'document_version_uploaded',
      priority: 'medium',
      documentId,
      documentName,
      actor: {
        user_id: actor.userId || actor.user_id,
        user_name: actor.userName || actor.user_name,
        user_email: actor.userEmail || actor.user_email
      },
      metadata: {
        version: newVersion
      },
      actionUrl,
      sendEmail: true,
      emailTemplate: 'document_update',
      emailVariables: {
        creator_name: 'User',
        document_name: documentName,
        document_category: document.category || 'N/A',
        document_type: document.type || 'N/A',
        document_id: documentId,
        new_status: `Version ${newVersion}`,
        status_class: 'approved',
        reviewer_name: actor.userName || actor.user_name,
        review_date_formatted: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        comment: `New version ${newVersion} uploaded`,
        document_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}${actionUrl}`
      }
    };

    return this.sendBulkNotifications(recipients, notificationData);
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Unread count
   */
  async getUnreadCount(userId) {
    return Notification.getUnreadCount(userId);
  }

  /**
   * Get notifications for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of notifications
   */
  async getUserNotifications(userId, options = {}) {
    return Notification.getUserNotifications(userId, options);
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID or email (for security check)
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      _id: notificationId,
      $or: [
        { user_id: userId },
        { user_email: userId }
      ]
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    return notification.markAsRead();
  }

  /**
   * Mark multiple notifications as read
   * @param {Array<string>} notificationIds - Array of notification IDs
   * @param {string} userId - User ID (for security check)
   * @returns {Promise<Object>} Update result
   */
  async markMultipleAsRead(notificationIds, userId) {
    return Notification.markMultipleAsRead(notificationIds, userId);
  }
}

module.exports = new NotificationService();
