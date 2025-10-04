const mongoose = require('mongoose');

// Metadata schema for additional floor information
const FloorMetadataSchema = new mongoose.Schema({
  key: {
    type: String,
    trim: true
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Floor schema - Simplified
const FloorSchema = new mongoose.Schema({
  // Location - Required relationships
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true
  },

  // Primary Details
  floor_name: {
    type: String,
    required: true,
    trim: true
  },
  floor_number: {
    type: Number
  },

  // Floor Type - Simplified dropdown
  floor_type: {
    type: String,
    enum: ['Office', 'Retail', 'Plant Room', 'Lab', 'Common Area', 'Residential'],
    required: true,
    trim: true
  },

  // Occupancy (renamed to maximum_occupancy)
  maximum_occupancy: {
    type: Number,
    min: 0,
    default: 0
  },

  // Occupancy Type - Tenancy arrangement
  occupancy_type: {
    type: String,
    enum: ['Single Tenant', 'Multi Tenant', 'Common Area']
  },

  // Access Control - Security level
  access_control: {
    type: String,
    enum: ['Public', 'Keycard Required', 'Restricted']
  },

  // Fire Compartment - Emergency planning/safety designation
  fire_compartment: {
    type: String,
    trim: true
  },

  // HVAC Zones - System coordination/climate control
  hvac_zones: {
    type: Number,
    min: 0
  },

  // Special Features - Notable characteristics
  special_features: {
    type: [String],
    enum: ['Equipment Room', 'Common Area', 'Server Room', 'Meeting Room', 'Kitchen', 'Storage'],
    default: []
  },

  // Area specifications
  area_number: {
    type: Number,
    min: 0
  },
  area_unit: {
    type: String,
    enum: ['m²', 'sq ft'],
    default: 'm²'
  },
  floor_area: {
    type: Number,
    min: 0
  },
  floor_area_unit: {
    type: String,
    enum: ['m²', 'sq ft'],
    default: 'm²'
  },
  ceiling_height: {
    type: Number,
    min: 0
  },
  ceiling_height_unit: {
    type: String,
    enum: ['m', 'ft'],
    default: 'm'
  },

  // Status
  status: {
    type: String,
    default: 'Active'
  },

  // Relationships
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  // Additional Information
  metadata: [FloorMetadataSchema],

  // Counts
  assets_count: {
    type: Number,
    default: 0,
    min: 0
  },

  // System fields
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for display name
FloorSchema.virtual('display_name').get(function() {
  return this.floor_name || 'Unnamed Floor';
});

// Virtual for formatted area
FloorSchema.virtual('formatted_area').get(function() {
  if (this.area_number) {
    return `${this.area_number.toLocaleString()} ${this.area_unit}`;
  }
  return 'N/A';
});

// Virtual for backward compatibility - occupancy maps to maximum_occupancy
FloorSchema.virtual('occupancy').get(function() {
  return this.maximum_occupancy;
}).set(function(value) {
  this.maximum_occupancy = value;
});

// Indexes for performance
FloorSchema.index({ floor_name: 1 });
FloorSchema.index({ site_id: 1 });
FloorSchema.index({ building_id: 1 });
FloorSchema.index({ customer_id: 1 });
FloorSchema.index({ floor_type: 1 });
FloorSchema.index({ status: 1 });
FloorSchema.index({ is_active: 1 });
FloorSchema.index({ occupancy_type: 1 });
FloorSchema.index({ access_control: 1 });
FloorSchema.index({ special_features: 1 });

// Compound indexes
FloorSchema.index({ building_id: 1, floor_name: 1 });
FloorSchema.index({ site_id: 1, building_id: 1 });
FloorSchema.index({ customer_id: 1, building_id: 1 });

// Ensure virtual fields are serialized
FloorSchema.set('toJSON', { virtuals: true });
FloorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Floor', FloorSchema);