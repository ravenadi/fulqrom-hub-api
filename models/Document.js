const mongoose = require('mongoose');

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

// Location schema for hierarchical associations
const LocationSchema = new mongoose.Schema({
  site: {
    site_id: {
      type: String,
      trim: true
    },
    site_name: {
      type: String,
      trim: true
    }
  },
  building: {
    building_id: {
      type: String,
      trim: true
    },
    building_name: {
      type: String,
      trim: true
    }
  },
  floor: {
    floor_id: {
      type: String,
      trim: true
    },
    floor_name: {
      type: String,
      trim: true
    }
  },
  asset: {
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
  },
  tenant: {
    tenant_id: {
      type: String,
      trim: true
    },
    tenant_name: {
      type: String,
      trim: true
    }
  }
}, { _id: false });

// Customer schema
const CustomerSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    required: true,
    trim: true
  },
  customer_name: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

// Compliance and regulatory metadata schema
const MetadataSchema = new mongoose.Schema({
  engineering_discipline: {
    type: String,
    enum: ['Architectural', 'Structural', 'Electrical', 'Mechanical'],
    trim: true
  },
  regulatory_framework: {
    type: String,
    enum: ['as1851_fire_systems', 'as3745_emergency_control', 'nabers_energy', 'green_star', 'whs_compliance', 'essential_safety_measures'],
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
    enum: ['current', 'expiring_30_days', 'overdue', 'under_review'],
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
  }
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
  category: {
    type: String,
    required: true,
    enum: ['drawing_register', 'compliance_regulatory', 'standards_procedures', 'building_management', 'general_repository'],
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['compliance', 'standards', 'management', 'general', 'service_report'],
    trim: true
  },
  engineering_discipline: {
    type: String,
    enum: ['Architectural', 'Structural', 'Electrical', 'Mechanical'],
    trim: true
  },

  // Document Status
  status: {
    type: String,
    enum: ['Approved', 'Under Review', 'Draft', 'Rejected', 'Archived'],
    default: 'Draft',
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

  // Compliance & Regulatory Metadata
  metadata: MetadataSchema,

  // Audit Fields
  created_by: {
    type: String,
    trim: true
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
DocumentSchema.index({ created_at: -1 });
DocumentSchema.index({ 'metadata.regulatory_framework': 1 });
DocumentSchema.index({ 'metadata.compliance_status': 1 });

// Compound indexes
DocumentSchema.index({ 'customer.customer_id': 1, category: 1 });
DocumentSchema.index({ 'location.building.building_id': 1, category: 1 });
DocumentSchema.index({ category: 1, type: 1 });

// Text index for search
DocumentSchema.index({
  name: 'text',
  description: 'text',
  'tags.tags': 'text'
});

// Ensure virtual fields are serialized
DocumentSchema.set('toJSON', { virtuals: true });
DocumentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Document', DocumentSchema);