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

  // Occupancy
  occupancy: {
    type: Number,
    min: 0,
    default: 0
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

  // Relationships
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
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

// Indexes for performance
FloorSchema.index({ floor_name: 1 });
FloorSchema.index({ site_id: 1 });
FloorSchema.index({ building_id: 1 });
FloorSchema.index({ customer_id: 1 });
FloorSchema.index({ floor_type: 1 });
FloorSchema.index({ is_active: 1 });

// Compound indexes
FloorSchema.index({ building_id: 1, floor_name: 1 });
FloorSchema.index({ site_id: 1, building_id: 1 });
FloorSchema.index({ customer_id: 1, building_id: 1 });

// Ensure virtual fields are serialized
FloorSchema.set('toJSON', { virtuals: true });
FloorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Floor', FloorSchema);