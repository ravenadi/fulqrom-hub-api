const mongoose = require('mongoose');

// Structured address schema
const SiteAddressSchema = new mongoose.Schema({
  street: {
    type: String,
    trim: true
  },
  suburb: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    enum: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'],
    trim: true
  },
  postcode: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\d{4}$/.test(v);
      },
      message: 'Postcode must be 4 digits'
    }
  },
  latitude: {
    type: Number,
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    min: -180,
    max: 180
  },
  full_address: {
    type: String,
    trim: true
  }
}, { _id: false });

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
    type: mongoose.Schema.Types.Mixed,
    default: function() {
      return {};
    }
  },

  site_code: {
    type: String,
    trim: true
  },

  type: {
    type: String,
    enum: ['commercial', 'mixed-use', 'industrial', 'University Campus', 'Shopping Centre', 'Corporate Office', 'Industrial Park', 'Data Center', 'Healthcare'],
    default: 'commercial'
  },

  security_level: {
    type: String,
    enum: ['Public Access', 'Controlled Access', 'High Security'],
    default: 'Controlled Access'
  },

  site_logo: {
    type: String,
    trim: true
  },

  building_image: {
    type: String,
    trim: true
  },

  project_name: {
    type: String,
    trim: true
  },

  local_council: {
    type: String,
    trim: true
  },

  total_floor_area: {
    type: Number,
    default: 0
  },

  electricity_consumption: {
    value: {
      type: Number,
      default: 0
    },
    trend: {
      type: String,
      enum: ['up', 'down', 'stable'],
      default: 'stable'
    },
    yoy_change: {
      type: Number,
      default: 0
    }
  },

  activity_level: {
    total_actions: {
      type: Number,
      default: 0
    },
    closed_actions: {
      type: Number,
      default: 0
    },
    completion_rate: {
      type: Number,
      default: 0
    }
  },

  comfort_score: {
    rating: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor'],
      default: 'good'
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },

  equipment_health: {
    status: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor'],
      default: 'good'
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },

  status: {
    type: String,
    enum: ['active', 'development', 'maintenance', 'inactive', 'planning', 'Operational', 'In Development', 'Maintenance', 'Inactive', 'Decommissioned', 'Planned'],
    default: 'active'
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

// Virtual for display address - handles both old string format and new object format
SiteSchema.virtual('display_address').get(function() {
  if (!this.address) return '';

  // If address is still a string (backward compatibility)
  if (typeof this.address === 'string') {
    return this.address;
  }

  // If address is an object, use full_address or build from components
  if (typeof this.address === 'object') {
    if (this.address.full_address) {
      return this.address.full_address;
    }

    // Build address from components
    const parts = [];
    if (this.address.street) parts.push(this.address.street);
    if (this.address.suburb) parts.push(this.address.suburb);
    if (this.address.state) parts.push(this.address.state);
    if (this.address.postcode) parts.push(this.address.postcode);

    return parts.join(', ');
  }

  return '';
});

// Indexes for performance
SiteSchema.index({ site_name: 1 });
SiteSchema.index({ customer_id: 1 });
SiteSchema.index({ status: 1 });
SiteSchema.index({ is_active: 1 });
SiteSchema.index({ address: 1 });
SiteSchema.index({ 'address.state': 1 });
SiteSchema.index({ 'address.postcode': 1 });
SiteSchema.index({ type: 1 });
SiteSchema.index({ 'manager.name': 1 });

// Ensure virtual fields are serialized
SiteSchema.set('toJSON', { virtuals: true });
SiteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Site', SiteSchema);