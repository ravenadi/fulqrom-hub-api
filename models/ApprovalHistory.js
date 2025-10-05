const mongoose = require('mongoose');

// Approval History Schema for tracking document approval workflow
const ApprovalHistorySchema = new mongoose.Schema({
  // Document reference
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },

  // Document details (denormalized for quick access)
  document_name: {
    type: String,
    required: true,
    trim: true
  },

  // Approval action details
  action: {
    type: String,
    required: true,
    enum: ['requested', 'approved', 'rejected', 'revoked'],
    trim: true
  },

  // Previous status
  previous_status: {
    type: String,
    trim: true
  },

  // New status
  new_status: {
    type: String,
    required: true,
    trim: true
  },

  // User who performed the action
  performed_by: {
    type: String,
    required: true,
    trim: true
  },

  // User details (optional)
  performed_by_name: {
    type: String,
    trim: true
  },

  // Assigned to (for approval requests)
  assigned_to: {
    type: String,
    trim: true
  },

  // Assigned to name
  assigned_to_name: {
    type: String,
    trim: true
  },

  // Comments/notes for the action
  comments: {
    type: String,
    trim: true
  },

  // Additional metadata
  metadata: {
    ip_address: {
      type: String,
      trim: true
    },
    user_agent: {
      type: String,
      trim: true
    }
  },

  // Timestamp
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

// Indexes for performance
ApprovalHistorySchema.index({ document_id: 1, created_at: -1 });
ApprovalHistorySchema.index({ performed_by: 1, created_at: -1 });
ApprovalHistorySchema.index({ assigned_to: 1, created_at: -1 });
ApprovalHistorySchema.index({ action: 1, created_at: -1 });
ApprovalHistorySchema.index({ new_status: 1 });

// Compound indexes
ApprovalHistorySchema.index({ document_id: 1, action: 1 });

// Virtual for formatted date
ApprovalHistorySchema.virtual('formatted_date').get(function() {
  return this.created_at.toISOString();
});

// Ensure virtual fields are serialized
ApprovalHistorySchema.set('toJSON', { virtuals: true });
ApprovalHistorySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ApprovalHistory', ApprovalHistorySchema);
