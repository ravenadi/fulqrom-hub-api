const mongoose = require('mongoose');

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
  // Primary Information
  asset_name: {
    type: String,
    trim: true
  },
  asset_id_tag: {
    type: String,
    trim: true
  },

  // Location - References to other entities
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
  building_tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  },
  location_description: {
    type: String,
    trim: true
  },

  // Classification & Status
  category: {
    type: String,
    trim: true
    // HVAC, Security, Safety, Equipment
  },
  type: {
    type: String,
    trim: true
    // VAV - Variable Air Volume Box, etc.
  },
  status: {
    type: String,
    trim: true
    // Operational, Under Testing, Maintenance Required, Active
  },
  condition: {
    type: String,
    trim: true
    // Good, Excellent, New, Fair
  },

  // Details
  manufacturer: {
    type: String,
    trim: true
  },
  model_number: {
    type: String,
    trim: true
  },
  serial_number: {
    type: String,
    trim: true
  },
  installation_date: {
    type: Date
  },
  warranty_expiry: {
    type: Date
  },

  // Additional metadata
  metadata: [AssetMetadataSchema],

  // System fields
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  is_active: {
    type: Boolean,
    default: true
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

// Virtual for formatted warranty expiry
AssetSchema.virtual('formatted_warranty_expiry').get(function() {
  if (!this.warranty_expiry) return '';
  return this.warranty_expiry.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
});

// Virtual to check if warranty is expired
AssetSchema.virtual('warranty_expired').get(function() {
  if (!this.warranty_expiry) return false;
  return this.warranty_expiry < new Date();
});

// Virtual for full asset description (like in the table)
AssetSchema.virtual('full_description').get(function() {
  let desc = this.asset_name || '';
  if (this.manufacturer) {
    desc += `\n${this.manufacturer}`;
    if (this.model_number) {
      desc += ` - ${this.model_number}`;
    }
  }
  if (this.serial_number && this.serial_number !== 'N/A') {
    desc += `\nS/N: ${this.serial_number}`;
  }
  return desc;
});

// Virtual for display location
AssetSchema.virtual('display_location').get(function() {
  return this.location_description || '';
});

// Indexes for performance
AssetSchema.index({ asset_name: 1 });
AssetSchema.index({ asset_id_tag: 1 });
AssetSchema.index({ customer_id: 1 });
AssetSchema.index({ site_id: 1 });
AssetSchema.index({ building_id: 1 });
AssetSchema.index({ category: 1 });
AssetSchema.index({ status: 1 });
AssetSchema.index({ condition: 1 });
AssetSchema.index({ manufacturer: 1 });
AssetSchema.index({ warranty_expiry: 1 });
AssetSchema.index({ is_active: 1 });

// Compound indexes for common queries
AssetSchema.index({ customer_id: 1, category: 1 });
AssetSchema.index({ site_id: 1, status: 1 });
AssetSchema.index({ category: 1, status: 1 });

// Ensure virtual fields are serialized
AssetSchema.set('toJSON', { virtuals: true });
AssetSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Asset', AssetSchema);