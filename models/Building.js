const mongoose = require('mongoose');

// Metadata schema for additional building information
const BuildingMetadataSchema = new mongoose.Schema({
  key: {
    type: String,
    trim: true
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Building schema
const BuildingSchema = new mongoose.Schema({
  // Basic Information
  building_name: {
    type: String,
    trim: true
  },
  building_code: {
    type: String,
    trim: true
  },
  image_url: {
    type: String,
    trim: true
  },

  // Relationships
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },
  building_manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  // Classification
  category: {
    type: String,
    trim: true
    // Retail, Office, Industrial, Mixed Use
  },
  building_type: {
    type: String,
    trim: true
    // Industrial, Commercial, Residential
  },
  building_grade: {
    type: String,
    trim: true
    // Grade A, Grade B, Grade C, Premium
  },
  primary_use: {
    type: String,
    trim: true
    // Warehouse, Office, Laboratory, Retail
  },

  // Specifications
  number_of_floors: {
    type: Number,
    default: 1
  },
  energy_rating: {
    type: Number,
    min: 0,
    max: 100
    // Percentage (0-100%)
  },

  // Status
  status: {
    type: String,
    trim: true
    // Active, Inactive, Under Construction, Planning
  },

  // Summary/Calculated fields (these would typically be calculated from floors/assets)
  total_floors: {
    type: Number,
    default: 0
  },
  active_floors: {
    type: Number,
    default: 0
  },
  total_assets: {
    type: Number,
    default: 0
  },
  avg_occupancy: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  // Additional metadata
  metadata: [BuildingMetadataSchema],

  // System fields
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for formatted energy rating
BuildingSchema.virtual('formatted_energy_rating').get(function() {
  return this.energy_rating ? `${this.energy_rating}%` : 'N/A';
});

// Virtual for display name
BuildingSchema.virtual('display_name').get(function() {
  return this.building_name || 'Unnamed Building';
});

// Virtual for building identifier (name + code)
BuildingSchema.virtual('building_identifier').get(function() {
  if (this.building_name && this.building_code) {
    return `${this.building_name} (${this.building_code})`;
  }
  return this.building_name || this.building_code || 'Unnamed Building';
});

// Virtual for occupancy status
BuildingSchema.virtual('occupancy_status').get(function() {
  if (this.avg_occupancy >= 90) return 'High';
  if (this.avg_occupancy >= 70) return 'Good';
  if (this.avg_occupancy >= 50) return 'Moderate';
  if (this.avg_occupancy > 0) return 'Low';
  return 'Empty';
});

// Indexes for performance
BuildingSchema.index({ building_name: 1 });
BuildingSchema.index({ building_code: 1 });
BuildingSchema.index({ site_id: 1 });
BuildingSchema.index({ customer_id: 1 });
BuildingSchema.index({ category: 1 });
BuildingSchema.index({ building_type: 1 });
BuildingSchema.index({ status: 1 });
BuildingSchema.index({ is_active: 1 });

// Compound indexes
BuildingSchema.index({ customer_id: 1, site_id: 1 });
BuildingSchema.index({ site_id: 1, status: 1 });
BuildingSchema.index({ category: 1, building_grade: 1 });

// Ensure virtual fields are serialized
BuildingSchema.set('toJSON', { virtuals: true });
BuildingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Building', BuildingSchema);