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

  // Floor Type - loaded from GET /api/dropdowns (floor_floor_types)
  floor_type: {
    type: String,
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
    trim: true
  },

  // Access Control - Security level
  access_control: {
    type: String,
    trim: true
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
    default: []
  },

  // Area specifications - units loaded from GET /api/dropdowns (floor_floor_area_units)
  area_number: {
    type: Number,
    min: 0
  },
  area_unit: {
    type: String,
    default: 'm²'
  },
  floor_area: {
    type: Number,
    min: 0
  },
  floor_area_unit: {
    type: String,
    default: 'm²'
  },
  ceiling_height: {
    type: Number,
    min: 0
  },
  ceiling_height_unit: {
    type: String,
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
FloorSchema.index({ occupancy_type: 1 });
FloorSchema.index({ access_control: 1 });
FloorSchema.index({ special_features: 1 });

// Compound indexes
FloorSchema.index({ building_id: 1, floor_name: 1 });
FloorSchema.index({ site_id: 1, building_id: 1 });
FloorSchema.index({ customer_id: 1, building_id: 1 });

// Unique constraint: One floor_name per customer_id
FloorSchema.index({ customer_id: 1, floor_name: 1 }, { unique: true });

// Ensure virtual fields are serialized and preserve unpopulated IDs
FloorSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Preserve ObjectId if population returned null
    // Check if field was populated and get the original ID
    if (ret.site_id === null) {
      const originalId = doc.populated('site_id') || doc._doc?.site_id || doc.site_id;
      if (originalId) ret.site_id = originalId;
    }
    if (ret.building_id === null) {
      const originalId = doc.populated('building_id') || doc._doc?.building_id || doc.building_id;
      if (originalId) ret.building_id = originalId;
    }
    if (ret.customer_id === null) {
      const originalId = doc.populated('customer_id') || doc._doc?.customer_id || doc.customer_id;
      if (originalId) ret.customer_id = originalId;
    }
    return ret;
  }
});
FloorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Floor', FloorSchema);