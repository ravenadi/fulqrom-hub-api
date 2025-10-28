const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// File metadata schema
const FileMetaSchema = new mongoose.Schema({
  file_name: {
    type: String,
    required: true,
    trim: true
  },
  file_size: {
    type: Number,
    required: true
  },
  file_type: {
    type: String,
    required: true,
    trim: true
  },
  file_extension: {
    type: String,
    required: true,
    trim: true
  },
  file_url: {
    type: String,
    trim: true
  },
  file_path: {
    type: String,
    trim: true
  },
  file_key: {
    type: String,
    trim: true
  },
  bucket_name: {
    type: String,
    trim: true
  },
  version: {
    type: String,
    default: '1.0',
    trim: true
  },
  file_mime_type: {
    type: String,
    trim: true
  }
}, { _id: false });

// File container schema
const FileSchema = new mongoose.Schema({
  file_meta: FileMetaSchema
}, { _id: false });

// Tags schema (nested structure to match existing pattern)
const TagsSchema = new mongoose.Schema({
  tags: [{
    type: String,
    trim: true
  }]
}, { _id: false });

// Location schema for hierarchical associations (IDs only - names populated dynamically)
const LocationSchema = new mongoose.Schema({
  site: {
    site_id: {
      type: String,
      trim: true
    }
  },
  building: {
    building_id: {
      type: String,
      trim: true
    }
  },
  floor: {
    floor_id: {
      type: String,
      trim: true
    }
  },
  // Support for multiple assets
  assets: [{
    asset_id: {
      type: String,
      trim: true
    },
    asset_name: {
      type: String,
      trim: true
    },
    asset_type: {
      type: String,
      trim: true
    }
  }],
  // Legacy single asset field - kept for backward compatibility
  asset: {
    asset_id: {
      type: String,
      trim: true
    }
  },
  tenant: {
    tenant_id: {
      type: String,
      trim: true
    }
  },
  vendor: {
    vendor_id: {
      type: String,
      trim: true
    }
  }
}, { _id: false });

// Customer schema (ID only - name populated dynamically)
const CustomerSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

// DEPRECATED: Metadata wrapper removed - fields moved to root level
// Kept for backward compatibility during migration
const MetadataSchema = new mongoose.Schema({}, { _id: false, strict: false });

// Related drawings schema for cross-references
const RelatedDrawingSchema = new mongoose.Schema({
  document_id: {
    type: String,
    trim: true
  },
  document_name: {
    type: String,
    trim: true
  }
}, { _id: false });

// Version metadata schema for document versioning
const VersionMetadataSchema = new mongoose.Schema({
  uploaded_by: {
    user_id: {
      type: String,
      trim: true
    },
    user_name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true
    }
  },
  upload_timestamp: {
    type: Date,
    default: Date.now
  },
  change_notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  superseded_version: {
    type: String,
    trim: true
  },
  file_changes: {
    original_filename: {
      type: String,
      trim: true
    },
    file_size_bytes: {
      type: Number
    },
    file_hash: {
      type: String,
      trim: true
    }
  }
}, { _id: false });

// Drawing Register information schema
// NOTE: Enum validation removed - values loaded from GET /api/dropdowns
const DrawingInfoSchema = new mongoose.Schema({
  date_issued: {
    type: Date
  },
  drawing_status: {
    type: String,
    default: 'draft',
    trim: true
  },
  prepared_by: {
    type: String,
    trim: true
  },
  drawing_scale: {
    type: String,
    trim: true
  },
  approved_by_user: {
    type: String,
    trim: true
  },
  related_drawings: [RelatedDrawingSchema]
}, { _id: false });

// Access control schema
// NOTE: Enum validation removed - values loaded from GET /api/dropdowns
const AccessControlSchema = new mongoose.Schema({
  access_level: {
    type: String,
    default: 'internal',
    trim: true
  },
  access_users: [{
    type: String,
    trim: true
  }]
}, { _id: false });

// Main Document schema
const DocumentSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
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
  // NOTE: Enum validation removed - values loaded from GET /api/dropdowns (document_document_categories, document_document_types, etc.)
  category: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  engineering_discipline: {
    type: String,
    trim: true
  },

  // Document Status
  // NOTE: Enum validation removed - values loaded from GET /api/dropdowns (document_document_statuses)
  status: {
    type: String,
    default: 'Draft',
    trim: true
  },

  // Compliance and Regulatory Fields (flattened from metadata)
  regulatory_framework: {
    type: String,
    trim: true
  },
  certification_number: {
    type: String,
    trim: true
  },
  compliance_framework: {
    type: String,
    trim: true
  },
  compliance_status: {
    type: String,
    trim: true
  },
  issue_date: {
    type: String,
    trim: true
  },
  expiry_date: {
    type: String,
    trim: true
  },
  review_date: {
    type: String,
    trim: true
  },
  frequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'annual', null],
    trim: true
  },

  // File Information
  file: FileSchema,

  // Tags
  tags: TagsSchema,

  // Location & Associations
  location: LocationSchema,

  // Customer Information
  customer: CustomerSchema,

  // DEPRECATED: Metadata wrapper - kept for backward compatibility only
  metadata: MetadataSchema,

  // Drawing Register Information (for category === 'Drawing Register' or similar drawing categories)
  drawing_info: DrawingInfoSchema,

  // Access Control
  access_control: AccessControlSchema,

  // Approval workflow (legacy fields - kept for backward compatibility)
  // NOTE: Enum validation removed - values loaded from GET /api/dropdowns (document_document_approval_statuses)
  approval_required: {
    type: Boolean,
    default: false
  },
  approved_by: {
    type: String,
    trim: true
  },
  approval_status: {
    type: String,
    default: 'Pending',
    trim: true
  },

  // New Approval Configuration (preferred)
  approval_config: {
    enabled: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      trim: true,
      default: 'Draft'
    },
    approvers: [{
      user_id: {
        type: String,
        trim: true
      },
      user_name: {
        type: String,
        trim: true
      },
      user_email: {
        type: String,
        trim: true,
        lowercase: true,
        required: function() {
          return this.approval_config && this.approval_config.enabled;
        }
      }
    }],
    approval_history: [{
      user_id: String,
      user_name: String,
      user_email: String,
      status: String,
      comment: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },

  // Version Management Fields
  document_group_id: {
    type: String,
    trim: true,
    index: true
  },
  version_number: {
    type: String,
    trim: true,
    default: '1.0'
  },
  is_current_version: {
    type: Boolean,
    default: true,
    index: true
  },
  version_sequence: {
    type: Number,
    default: 1
  },
  version_metadata: VersionMetadataSchema,

  // Audit Fields
  created_by: {
    user_id: {
      type: String,
      trim: true
    },
    user_name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },
  created_at: {
    type: String,
    default: () => new Date().toISOString()
  },
  updated_at: {
    type: String,
    default: () => new Date().toISOString()
  }
}, {
  timestamps: false
});

// Virtual for display name
DocumentSchema.virtual('display_name').get(function() {
  return this.name || 'Unnamed Document';
});

// Virtual for file size
DocumentSchema.virtual('formatted_file_size').get(function() {
  if (this.file && this.file.file_meta && this.file.file_meta.file_size) {
    const sizeInMB = (this.file.file_meta.file_size / (1024 * 1024)).toFixed(1);
    return `${sizeInMB} MB`;
  }
  return 'N/A';
});

// Virtual for location display
DocumentSchema.virtual('location_display').get(function() {
  const parts = [];
  if (this.location && this.location.building && this.location.building.building_name) {
    parts.push(this.location.building.building_name);
  }
  if (this.location && this.location.floor && this.location.floor.floor_name) {
    parts.push(this.location.floor.floor_name);
  }
  return parts.length > 0 ? parts.join(' - ') : 'N/A';
});

// Pre-save middleware to update timestamps
DocumentSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date().toISOString();
  }
  next();
});

// Indexes for performance
DocumentSchema.index({ name: 1 });
DocumentSchema.index({ category: 1 });
DocumentSchema.index({ type: 1 });
DocumentSchema.index({ 'customer.customer_id': 1 });
DocumentSchema.index({ 'location.site.site_id': 1 });
DocumentSchema.index({ 'location.building.building_id': 1 });
DocumentSchema.index({ 'location.floor.floor_id': 1 });
DocumentSchema.index({ 'location.asset.asset_id': 1 });
DocumentSchema.index({ 'location.tenant.tenant_id': 1 });
DocumentSchema.index({ 'location.vendor.vendor_id': 1 });
DocumentSchema.index({ created_at: -1 });
// Compliance field indexes (flattened from metadata)
DocumentSchema.index({ regulatory_framework: 1 });
DocumentSchema.index({ compliance_status: 1 });
DocumentSchema.index({ expiry_date: 1 });
DocumentSchema.index({ issue_date: 1 });
DocumentSchema.index({ review_date: 1 });
DocumentSchema.index({ frequency: 1 });

// Drawing Register indexes
DocumentSchema.index({ 'drawing_info.drawing_status': 1 });
DocumentSchema.index({ 'drawing_info.prepared_by': 1 });
DocumentSchema.index({ 'drawing_info.approved_by_user': 1 });
DocumentSchema.index({ 'drawing_info.date_issued': -1 });

// Access Control indexes
DocumentSchema.index({ 'access_control.access_level': 1 });
DocumentSchema.index({ 'access_control.access_users': 1 });

// Approval workflow indexes (legacy)
DocumentSchema.index({ approval_status: 1 });
DocumentSchema.index({ approval_required: 1 });
DocumentSchema.index({ approved_by: 1 });

// New approval config indexes
DocumentSchema.index({ 'approval_config.enabled': 1 });
DocumentSchema.index({ 'approval_config.status': 1 });
DocumentSchema.index({ 'approval_config.approvers.user_email': 1 });

// Compound indexes
DocumentSchema.index({ 'customer.customer_id': 1, category: 1 });
DocumentSchema.index({ 'location.building.building_id': 1, category: 1 });
DocumentSchema.index({ category: 1, type: 1 });
DocumentSchema.index({ category: 1, 'drawing_info.drawing_status': 1 });

// Version Management indexes
DocumentSchema.index({ document_group_id: 1, version_sequence: -1 });
DocumentSchema.index({ document_group_id: 1, is_current_version: 1 });

// Text index for search
DocumentSchema.index({
  name: 'text',
  description: 'text',
  'tags.tags': 'text'
});

// Ensure virtual fields are serialized
DocumentSchema.set('toJSON', { virtuals: true });
DocumentSchema.set('toObject', { virtuals: true });

// Apply tenant isolation plugin
DocumentSchema.plugin(tenantPlugin);

const Document = mongoose.model('Document', DocumentSchema);

// Setup audit hooks
const { setupAuditHooks, addAuditContextHelper } = require('../utils/auditHook');
addAuditContextHelper(Document);
setupAuditHooks(Document, { module: 'document' });

module.exports = Document;