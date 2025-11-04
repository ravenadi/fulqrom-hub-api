const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Metadata schema for additional asset information
const AssetMetadataSchema = new mongoose.Schema({
  key: {
    type: String,
    trim: true
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Asset schema
const AssetSchema = new mongoose.Schema({
  // System fields
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
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

  // Primary Information
  asset_id: {
    type: String,
    trim: true
  },
  asset_no: {
    type: String,
    trim: true
  },
  device_id: {
    type: String,
    trim: true
  },

  // Classification & Status
  status: {
    type: String,
    trim: true
    // Active, Inactive, etc.
  },
  category: {
    type: String,
    trim: true
    // Boiler System, Chiller System, etc.
  },
  type: {
    type: String,
    trim: true
    // Boiler - Gas Fired, Pump - Chilled Water, etc.
  },
  condition: {
    type: String,
    trim: true
    // Excellent, Good, Average, Poor, Critical
  },
  criticality_level: {
    type: String,
    trim: true
    // Low, Medium, High, Critical - loaded from GET /api/dropdowns
  },

  // Details
  make: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  serial: {
    type: String,
    trim: true
  },

  // HVAC/Refrigerant Information
  refrigerant: {
    type: String,
    trim: true
  },
  refrigerant_capacity: {
    type: String,
    trim: true
  },
  refrigerant_consumption: {
    type: String,
    trim: true
  },

  // Location Information
  level: {
    type: String,
    trim: true
  },
  area: {
    type: String,
    trim: true
  },

  // Ownership & Service
  owner: {
    type: String,
    trim: true
  },
  da19_life_expectancy: {
    type: String,
    trim: true
  },
  service_status: {
    type: String,
    trim: true
  },

  // Dates & Testing
  date_of_installation: {
    type: Date
  },
  age: {
    type: String,
    trim: true
  },
  last_test_date: {
    type: Date
  },
  last_test_result: {
    type: String,
    trim: true
  },

  // Financial Information
  purchase_cost_aud: {
    type: Number,
    min: 0
  },
  current_book_value_aud: {
    type: Number,
    min: 0
  },
  weight_kgs: {
    type: String
  },
  // Legacy field names (kept for backward compatibility)
  acquisition_cost: {
    type: String,
    min: 0
  },
  current_value: {
    type: String,
    min: 0
  },
  purchase_cost: {
    type: Number,
    min: 0
  },
  current_book_value: {
    type: Number,
    min: 0
  },
  weight: {
    type: String
  },
  installation_date: {
    type: Date
  },

  // System fields
  is_active: {
    type: Boolean,
    default: true
  },
  is_delete: {
    type: Boolean,
    default: false,
    index: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for formatted installation date
AssetSchema.virtual('formatted_installation_date').get(function() {
  if (!this.installation_date) return '';
  return this.installation_date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
});

// Virtual for full asset description (like in the table)
AssetSchema.virtual('full_description').get(function() {
  let desc = this.asset_no || '';
  if (this.make) {
    desc += `\n${this.make}`;
    if (this.model) {
      desc += ` - ${this.model}`;
    }
  }
  if (this.serial && this.serial !== 'N/A') {
    desc += `\nS/N: ${this.serial}`;
  }
  return desc;
});

// Virtual for display location
AssetSchema.virtual('display_location').get(function() {
  return this.area || '';
});

// Indexes for performance
AssetSchema.index({ asset_no: 1 });
AssetSchema.index({ asset_id: 1 });
AssetSchema.index({ customer_id: 1 });
AssetSchema.index({ site_id: 1 });
AssetSchema.index({ building_id: 1 });
AssetSchema.index({ floor_id: 1 });
AssetSchema.index({ category: 1 });
AssetSchema.index({ status: 1 });
AssetSchema.index({ condition: 1 });
AssetSchema.index({ criticality_level: 1 });
AssetSchema.index({ make: 1 });
AssetSchema.index({ is_active: 1 });

// Compound indexes for common queries
AssetSchema.index({ customer_id: 1, category: 1 });
AssetSchema.index({ site_id: 1, status: 1 });
AssetSchema.index({ category: 1, status: 1 });

// Unique constraint: One asset_no per customer_id (sparse index - only applies when asset_no exists)
AssetSchema.index({ customer_id: 1, asset_no: 1 }, { unique: true, sparse: true });
AssetSchema.index({ tenant_id: 1, is_delete: 1 });

// Ensure virtual fields are serialized (similar to Vendor model)
AssetSchema.set('toJSON', { virtuals: true });
AssetSchema.set('toObject', { virtuals: true });

// Apply tenant plugin for multi-tenancy support
AssetSchema.plugin(tenantPlugin);

const Asset = mongoose.model('Asset', AssetSchema);

// Setup audit hooks
const { setupAuditHooks, addAuditContextHelper } = require('../utils/auditHook');
addAuditContextHelper(Asset);
setupAuditHooks(Asset, { module: 'asset' });

module.exports = Asset;