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

// Main Floor schema
const FloorSchema = new mongoose.Schema({
  // Location
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building'
  },

  // Primary Details
  floor_name: {
    type: String,
    trim: true
    // "Level 7", "Ground Floor", "Executive Suite"
  },
  floor_number: {
    type: String,
    trim: true
    // "7", "G", "1", "M", "PH"
  },

  // Classification & Access
  floor_type: {
    type: String,
    trim: true
    // Office, Lobby, Laboratory, Storage, Meeting, Executive
  },
  occupancy_type: {
    type: String,
    trim: true
    // Single Tenant, Multi Tenant, Mixed Use
  },
  access_control: {
    type: String,
    trim: true
    // Public, Private, Restricted, Secure
  },

  // Specifications
  floor_area: {
    type: Number
    // Area in square meters
  },
  floor_area_unit: {
    type: String,
    default: 'm²'
    // m², sq ft
  },
  ceiling_height: {
    type: Number
    // Height in meters
  },
  ceiling_height_unit: {
    type: String,
    default: 'm'
    // m, ft
  },
  max_occupancy: {
    type: Number
    // Maximum number of people
  },
  hvac_zones: {
    type: Number,
    default: 1
    // Number of HVAC zones
  },
  fire_compartment_id: {
    type: String,
    trim: true
    // Fire compartment identifier
  },

  // Current Status/Occupancy
  current_occupancy: {
    type: Number,
    default: 0
    // Current number of people/tenants
  },
  occupancy_percentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
    // Calculated occupancy percentage
  },
  assets_count: {
    type: Number,
    default: 0
    // Number of assets on this floor
  },

  // Status
  status: {
    type: String,
    trim: true
    // Active, Under Construction, Planning, Inactive
  },

  // Relationships
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  // Additional metadata
  metadata: [FloorMetadataSchema],

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
  if (this.floor_name && this.floor_number) {
    return `${this.floor_name} (${this.floor_number})`;
  }
  return this.floor_name || this.floor_number || 'Unnamed Floor';
});

// Virtual for formatted area
FloorSchema.virtual('formatted_area').get(function() {
  if (this.floor_area) {
    return `${this.floor_area.toLocaleString()} ${this.floor_area_unit || 'm²'}`;
  }
  return 'N/A';
});

// Virtual for formatted ceiling height
FloorSchema.virtual('formatted_ceiling_height').get(function() {
  if (this.ceiling_height) {
    return `${this.ceiling_height} ${this.ceiling_height_unit || 'm'}`;
  }
  return 'N/A';
});

// Virtual for occupancy display
FloorSchema.virtual('occupancy_display').get(function() {
  if (this.current_occupancy !== undefined && this.max_occupancy) {
    return `${this.current_occupancy}/${this.max_occupancy}`;
  }
  if (this.current_occupancy !== undefined) {
    return `${this.current_occupancy}`;
  }
  return 'N/A';
});

// Virtual for occupancy status
FloorSchema.virtual('occupancy_status').get(function() {
  if (this.occupancy_percentage >= 95) return 'Full';
  if (this.occupancy_percentage >= 80) return 'High';
  if (this.occupancy_percentage >= 60) return 'Good';
  if (this.occupancy_percentage >= 40) return 'Moderate';
  if (this.occupancy_percentage > 0) return 'Low';
  return 'Empty';
});

// Pre-save middleware to calculate occupancy percentage
FloorSchema.pre('save', function(next) {
  if (this.current_occupancy !== undefined && this.max_occupancy && this.max_occupancy > 0) {
    this.occupancy_percentage = Math.round((this.current_occupancy / this.max_occupancy) * 100);
  }
  next();
});

// Indexes for performance
FloorSchema.index({ floor_name: 1 });
FloorSchema.index({ floor_number: 1 });
FloorSchema.index({ site_id: 1 });
FloorSchema.index({ building_id: 1 });
FloorSchema.index({ customer_id: 1 });
FloorSchema.index({ floor_type: 1 });
FloorSchema.index({ status: 1 });
FloorSchema.index({ is_active: 1 });

// Compound indexes
FloorSchema.index({ building_id: 1, floor_number: 1 });
FloorSchema.index({ site_id: 1, building_id: 1 });
FloorSchema.index({ customer_id: 1, building_id: 1 });

// Ensure virtual fields are serialized
FloorSchema.set('toJSON', { virtuals: true });
FloorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Floor', FloorSchema);