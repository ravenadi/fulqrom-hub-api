const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

/**
 * In-App Notification Schema
 * Stores real-time notifications for users about document activities
 */
const NotificationSchema = new mongoose.Schema({
  // Recipient user information
  user_id: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  user_email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },

  // Notification content
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },

  // Notification type
  type: {
    type: String,
    required: true,
    enum: [
      'document_approval_status_changed',
      'document_status_changed',
      'document_comment_added',
      'document_approver_assigned',
      'document_version_uploaded',
      'document_approved',
      'document_rejected',
      'document_expiry_reminder',
      'service_report_reminder'
    ],
    index: true
  },

  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },

  // Related document information
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    index: true
  },

  document_name: {
    type: String,
    trim: true
  },

  // Related comment (if applicable)
  comment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentComment'
  },

  // Actor (person who triggered the notification)
  actor: {
    user_id: String,
    user_name: String,
    user_email: String
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Building/location information
  building: {
    type: String,
    trim: true
  },

  customer: {
    type: String,
    trim: true
  },

  // Read status
  is_read: {
    type: Boolean,
    default: false,
    index: true
  },

  read_at: {
    type: Date
  },

  // Action URL (where to navigate when clicked)
  action_url: {
    type: String,
    trim: true
  },

  // Email tracking fields
  email_sent: {
    type: Boolean,
    default: false
  },

  email_status: {
    type: String,
    enum: ['sent', 'failed', 'pending', 'not_sent'],
    default: 'not_sent'
  },

  email_provider_id: {
    type: String,
    trim: true
  },

  email_error: {
    type: String,
    trim: true
  },

  email_sent_at: {
    type: Date
  },

  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes for performance
NotificationSchema.index({ user_id: 1, created_at: -1 });
NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ user_email: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ document_id: 1, created_at: -1 });
NotificationSchema.index({ type: 1, created_at: -1 });
NotificationSchema.index({ priority: 1, is_read: 1 });

// Compound indexes
NotificationSchema.index({ user_id: 1, type: 1, is_read: 1 });
NotificationSchema.index({ created_at: -1, is_read: 1 });

// Update updated_at before save
NotificationSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Virtual for formatted date
NotificationSchema.virtual('formatted_date').get(function() {
  if (!this.created_at) return null;

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Sydney'
  }).format(this.created_at);
});

// Instance method to mark as read
NotificationSchema.methods.markAsRead = function() {
  this.is_read = true;
  this.read_at = new Date();
  return this.save();
};

// Instance method to mark as unread
NotificationSchema.methods.markAsUnread = function() {
  this.is_read = false;
  this.read_at = null;
  return this.save();
};

// Static method to get unread count for a user
NotificationSchema.statics.getUnreadCount = async function(userId) {
  // Normalize userId to lowercase if it's an email
  const normalizedUserId = userId.includes('@') ? userId.toLowerCase() : userId;

  const count = await this.countDocuments({
    $or: [
      { user_id: normalizedUserId },
      { user_email: normalizedUserId }
    ],
    is_read: false
  });

  return count;
};

// Static method to get notifications for a user
NotificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    unreadOnly = false,
    types = null,
    startDate = null,
    endDate = null
  } = options;

  // Normalize userId to lowercase if it's an email
  const normalizedUserId = userId.includes('@') ? userId.toLowerCase() : userId;

  // Query by both user_id and user_email to support different authentication modes
  const query = {
    $or: [
      { user_id: normalizedUserId },
      { user_email: normalizedUserId }
    ]
  };

  if (unreadOnly) {
    query.is_read = false;
  }

  if (types && Array.isArray(types) && types.length > 0) {
    query.type = { $in: types };
  }

  if (startDate || endDate) {
    query.created_at = {};
    if (startDate) query.created_at.$gte = new Date(startDate);
    if (endDate) query.created_at.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to mark multiple as read
NotificationSchema.statics.markMultipleAsRead = function(notificationIds, userId) {
  return this.updateMany(
    {
      _id: { $in: notificationIds },
      $or: [
        { user_id: userId },
        { user_email: userId }
      ]
    },
    {
      $set: {
        is_read: true,
        read_at: new Date(),
        updated_at: new Date()
      }
    }
  );
};

// Static method to delete old read notifications (cleanup)
NotificationSchema.statics.deleteOldReadNotifications = function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    is_read: true,
    read_at: { $lt: cutoffDate }
  });
};

// Ensure virtual fields are serialized
NotificationSchema.set('toJSON', { virtuals: true });
NotificationSchema.set('toObject', { virtuals: true });

// Apply tenant plugin for multi-tenancy support
NotificationSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Notification', NotificationSchema);
