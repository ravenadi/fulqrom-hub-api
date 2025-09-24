const mongoose = require('mongoose');

// Simplified address - just a string

// Manager schema
const SiteManagerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  title: {
    type: String,
    trim: true
  }
}, { _id: false });

// Metadata schema
const SiteMetadataSchema = new mongoose.Schema({
  key: {
    type: String,
    trim: true
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Site schema
const SiteSchema = new mongoose.Schema({
  site_name: {
    type: String,
    trim: true
  },

  address: {
    type: String,
    trim: true
  },

  status: {
    type: String,
    trim: true
    // Active, Under Construction, Planning, Inactive
  },

  // Counts - these would typically be calculated from related data
  buildings_count: {
    type: Number,
    default: 0
  },
  floors_count: {
    type: Number,
    default: 0
  },
  tenants_count: {
    type: Number,
    default: 0
  },
  assets_count: {
    type: Number,
    default: 0
  },

  manager: SiteManagerSchema,

  // Reference to customer
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  // Additional metadata
  metadata: [SiteMetadataSchema],

  // System fields
  is_active: {
    type: Boolean,
    default: true
  },

  created_date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for formatted creation date
SiteSchema.virtual('formatted_created_date').get(function() {
  if (!this.created_date) return '';
  return this.created_date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
});

// Virtual for display address (same as address since it's already full)
SiteSchema.virtual('display_address').get(function() {
  return this.address || '';
});

// Indexes for performance
SiteSchema.index({ site_name: 1 });
SiteSchema.index({ customer_id: 1 });
SiteSchema.index({ status: 1 });
SiteSchema.index({ is_active: 1 });
SiteSchema.index({ address: 1 });
SiteSchema.index({ 'manager.name': 1 });

// Ensure virtual fields are serialized
SiteSchema.set('toJSON', { virtuals: true });
SiteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Site', SiteSchema);