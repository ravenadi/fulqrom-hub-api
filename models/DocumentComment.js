const mongoose = require('mongoose');

/**
 * Document Comment Schema
 * Stores review comments and approval history for documents
 */
const DocumentCommentSchema = new mongoose.Schema({
  // Reference to the document
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },

  // Reviewer information
  user_id: {
    type: String,
    required: true,
    index: true
  },

  user_name: {
    type: String,
    required: true,
    trim: true
  },

  user_email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  // Review content
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },

  // Status at time of comment (Approved, Rejected, Needs Revision, etc.)
  status: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Mentioned users in comment (for notifications)
  mentioned_users: [{
    user_id: String,
    user_name: String,
    user_email: String
  }],

  // Attachments (optional)
  attachments: [{
    file_name: String,
    file_url: String,
    file_size: Number
  }],

  // Metadata
  is_active: {
    type: Boolean,
    default: true
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
  timestamps: false // Using custom timestamp fields
});

// Indexes for performance
DocumentCommentSchema.index({ document_id: 1, created_at: -1 });
DocumentCommentSchema.index({ user_id: 1, created_at: -1 });
DocumentCommentSchema.index({ document_id: 1, status: 1 });

// Update updated_at before save
DocumentCommentSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Virtual for formatted date (Australian format)
DocumentCommentSchema.virtual('formatted_date').get(function() {
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

// Static method to get comments for a document
DocumentCommentSchema.statics.getDocumentComments = function(documentId, options = {}) {
  const { limit = 100, skip = 0 } = options;

  return this.find({
    document_id: documentId,
    is_active: true
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get comment count for a document
DocumentCommentSchema.statics.getCommentCount = function(documentId) {
  return this.countDocuments({
    document_id: documentId,
    is_active: true
  });
};

// Ensure virtual fields are serialized
DocumentCommentSchema.set('toJSON', { virtuals: true });
DocumentCommentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DocumentComment', DocumentCommentSchema);
