const mongoose = require('mongoose');

// File schema for document files
const FileSchema = new mongoose.Schema({
  file_name: {
    type: String,
    trim: true
  },
  file_type: {
    type: String,
    trim: true
  },
  file_size: {
    type: Number
  },
  file_size_unit: {
    type: String,
    default: 'MB'
  },
  file_url: {
    type: String,
    trim: true
  },
  upload_date: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Tag schema for document tagging
const TagSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Document schema
const DocumentSchema = new mongoose.Schema({
  // Basic Information
  document_title: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  version: {
    type: String,
    trim: true,
    default: '1.0'
  },

  // Document Classification
  document_type: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  engineering_discipline: {
    type: String,
    trim: true
  },

  // Location & Association
  location: {
    type: String,
    trim: true
  },
  building_location: {
    type: String,
    trim: true
  },
  floor_location: {
    type: String,
    trim: true
  },

  // Status & Approval
  status: {
    type: String,
    trim: true,
    default: 'Draft'
  },
  approval_status: {
    type: String,
    trim: true,
    default: 'Pending'
  },

  // File Information
  files: [FileSchema],

  // Upload & Author Information
  uploaded_by: {
    type: String,
    trim: true
  },
  author_name: {
    type: String,
    trim: true
  },
  uploaded_date: {
    type: Date,
    default: Date.now
  },

  // Document Management
  tags: [TagSchema],
  access_level: {
    type: String,
    trim: true,
    default: 'Internal'
  },
  confidentiality: {
    type: String,
    trim: true,
    default: 'Standard'
  },

  // Review & Approval Workflow
  review_required: {
    type: Boolean,
    default: true
  },
  reviewer_name: {
    type: String,
    trim: true
  },
  review_date: {
    type: Date
  },
  approval_date: {
    type: Date
  },
  approved_by: {
    type: String,
    trim: true
  },

  // Revision Control
  revision_history: [{
    version: String,
    description: String,
    date: { type: Date, default: Date.now },
    author: String
  }],

  // Relationships
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building'
  },
  floor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Floor'
  },
  asset_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset'
  },

  // Additional Metadata
  project_number: {
    type: String,
    trim: true
  },
  drawing_number: {
    type: String,
    trim: true
  },
  specification_number: {
    type: String,
    trim: true
  },

  // Compliance & Standards
  compliance_standard: {
    type: String,
    trim: true
  },
  regulatory_requirement: {
    type: String,
    trim: true
  },

  // System fields
  is_active: {
    type: Boolean,
    default: true
  },
  is_archived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Virtual for display name
DocumentSchema.virtual('display_name').get(function() {
  return this.document_title || 'Unnamed Document';
});

// Virtual for primary file
DocumentSchema.virtual('primary_file').get(function() {
  return this.files && this.files.length > 0 ? this.files[0] : null;
});

// Virtual for file count
DocumentSchema.virtual('file_count').get(function() {
  return this.files ? this.files.length : 0;
});

// Virtual for formatted file size
DocumentSchema.virtual('formatted_file_size').get(function() {
  if (this.files && this.files.length > 0) {
    const totalSize = this.files.reduce((sum, file) => sum + (file.file_size || 0), 0);
    return `${totalSize.toFixed(1)} MB`;
  }
  return 'N/A';
});

// Virtual for status color
DocumentSchema.virtual('status_color').get(function() {
  const statusColors = {
    'Draft': 'blue',
    'Under Review': 'orange',
    'Approved': 'green',
    'Rejected': 'red',
    'Archived': 'gray'
  };
  return statusColors[this.status] || 'gray';
});

// Virtual for approval status color
DocumentSchema.virtual('approval_status_color').get(function() {
  const approvalColors = {
    'Pending': 'orange',
    'Approved': 'green',
    'Rejected': 'red',
    'Under Review': 'blue'
  };
  return approvalColors[this.approval_status] || 'gray';
});

// Virtual for location display
DocumentSchema.virtual('location_display').get(function() {
  const parts = [];
  if (this.building_location) parts.push(this.building_location);
  if (this.floor_location) parts.push(this.floor_location);
  return parts.length > 0 ? parts.join(' - ') : this.location || 'N/A';
});

// Pre-save middleware to update revision history
DocumentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.revision_history.push({
      version: this.version,
      description: 'Document updated',
      author: this.uploaded_by || 'System'
    });
  }
  next();
});

// Indexes for performance
DocumentSchema.index({ document_title: 1 });
DocumentSchema.index({ document_type: 1 });
DocumentSchema.index({ category: 1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ approval_status: 1 });
DocumentSchema.index({ customer_id: 1 });
DocumentSchema.index({ site_id: 1 });
DocumentSchema.index({ building_id: 1 });
DocumentSchema.index({ floor_id: 1 });
DocumentSchema.index({ uploaded_date: -1 });
DocumentSchema.index({ is_active: 1 });
DocumentSchema.index({ is_archived: 1 });

// Compound indexes
DocumentSchema.index({ customer_id: 1, document_type: 1 });
DocumentSchema.index({ building_id: 1, category: 1 });
DocumentSchema.index({ status: 1, approval_status: 1 });

// Text index for search
DocumentSchema.index({
  document_title: 'text',
  description: 'text',
  'tags.name': 'text'
});

// Ensure virtual fields are serialized
DocumentSchema.set('toJSON', { virtuals: true });
DocumentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Document', DocumentSchema);