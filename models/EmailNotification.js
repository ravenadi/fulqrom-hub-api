const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Email Notification Schema for tracking sent emails
const EmailNotificationSchema = new mongoose.Schema({
  // Email template type
  template: {
    type: String,
    required: true,
    enum: ['document_assignment', 'document_update'],
    index: true
  },

  // Recipient email
  to: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  // Email subject
  subject: {
    type: String,
    required: true,
    trim: true
  },

  // Template variables used
  variables: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Related document
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    index: true
  },

  // Send status
  status: {
    type: String,
    required: true,
    enum: ['sent', 'failed', 'pending'],
    default: 'pending',
    index: true
  },

  // Error message if failed
  error_message: {
    type: String,
    trim: true
  },

  // Retry count for failed emails
  retry_count: {
    type: Number,
    default: 0,
    min: 0
  },

  // Email provider message ID (e.g., SendGrid message ID)
  email_provider_id: {
    type: String,
    trim: true
  },

  // Email provider name
  email_provider: {
    type: String,
    trim: true,
    default: 'sendgrid'
  },

  // Timestamp when email was sent/attempted
  sent_at: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Timestamp when email was created
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes for performance
EmailNotificationSchema.index({ document_id: 1, sent_at: -1 });
EmailNotificationSchema.index({ to: 1, sent_at: -1 });
EmailNotificationSchema.index({ status: 1, retry_count: 1 });
EmailNotificationSchema.index({ template: 1, status: 1 });

// Compound indexes
EmailNotificationSchema.index({ document_id: 1, template: 1, status: 1 });
EmailNotificationSchema.index({ sent_at: -1, status: 1 });

// Virtual for formatted sent date
EmailNotificationSchema.virtual('formatted_sent_at').get(function() {
  if (!this.sent_at) return null;

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Sydney'
  }).format(this.sent_at);
});

// Method to mark as sent
EmailNotificationSchema.methods.markAsSent = function(providerId) {
  this.status = 'sent';
  this.email_provider_id = providerId;
  this.sent_at = new Date();
  return this.save();
};

// Method to mark as failed
EmailNotificationSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.error_message = errorMessage;
  this.retry_count += 1;
  this.sent_at = new Date();
  return this.save();
};

// Static method to get failed emails for retry
EmailNotificationSchema.statics.getFailedEmailsForRetry = function(maxRetries = 3) {
  return this.find({
    status: 'failed',
    retry_count: { $lt: maxRetries }
  })
  .sort({ sent_at: 1 })
  .limit(100);
};

// Ensure virtual fields are serialized
EmailNotificationSchema.set('toJSON', { virtuals: true });
EmailNotificationSchema.set('toObject', { virtuals: true });

// Apply tenant plugin for multi-tenancy support
EmailNotificationSchema.plugin(tenantPlugin);

module.exports = mongoose.model('EmailNotification', EmailNotificationSchema);
