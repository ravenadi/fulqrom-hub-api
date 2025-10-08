const mongoose = require('mongoose');

// Address schema for building location
const BuildingAddressSchema = new mongoose.Schema({
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
  full_address: {
    type: String,
    trim: true
  }
}, { _id: false });

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

// Building Manager schema (similar to Site Manager)
const BuildingManagerSchema = new mongoose.Schema({
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

// Main Building schema
const BuildingSchema = new mongoose.Schema({
  // Basic Information
  building_name: {
    type: String,
    required: true,
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

  // Address
  address: {
    type: BuildingAddressSchema,
    default: function() {
      return {};
    }
  },

  // Relationships
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  site_name: {
    type: String,
    trim: true
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  // Building Manager (embedded document like Site Manager)
  manager: BuildingManagerSchema,

  // Classification
  building_type: {
    type: String,
    required: true,
    trim: true
  },

  // Specifications
  number_of_floors: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  total_area: {
    type: Number,
    min: 0
  },
  year_built: {
    type: Number,
    min: 1900,
    max: new Date().getFullYear() + 10
  },

  // Primary Use - loaded from GET /api/dropdowns (building_building_types)
  primary_use: {
    type: String,
    required: true,
    default: 'Office',
    trim: true
  },

  // Last Inspection Date - Important for compliance and maintenance tracking
  last_inspection_date: {
    type: Date
  },

  // Accessibility Features - validation removed
  accessibility_features: {
    type: [String],
    default: []
  },

  // Parking Spaces - Total allocated parking for the building
  parking_spaces: {
    type: Number,
    min: 0,
    default: 0
  },

  // Geolocation - for Portfolio Map
  latitude: {
    type: Number,
    min: -90,
    max: 90,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || (v >= -90 && v <= 90);
      },
      message: 'Latitude must be between -90 and 90'
    }
  },
  longitude: {
    type: Number,
    min: -180,
    max: 180,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || (v >= -180 && v <= 180);
      },
      message: 'Longitude must be between -180 and 180'
    }
  },

  // NABERS Rating (0-6 star rating as per requirements)
  nabers_rating: {
    type: Number,
    min: 0,
    max: 6,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || (Number.isInteger(v) && v >= 0 && v <= 6);
      },
      message: 'NABERS rating must be between 0 and 6 stars'
    }
  },

  // Status (matching form payload)
  status: {
    type: String,
    default: 'Active',
    required: true
  },


  // Additional Information (renamed from metadata as per requirements)
  metadata: [BuildingMetadataSchema],

  // System fields
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for formatted NABERS rating
BuildingSchema.virtual('formatted_nabers_rating').get(function() {
  return this.nabers_rating !== null && this.nabers_rating !== undefined ? `${this.nabers_rating} star${this.nabers_rating !== 1 ? 's' : ''}` : 'Not Rated';
});

// Virtual for energy_rating (backward compatibility with Vue file)
BuildingSchema.virtual('energy_rating').get(function() {
  // Convert NABERS rating (0-6) to percentage for Vue compatibility
  return this.nabers_rating ? Math.round((this.nabers_rating / 6) * 100) : 0;
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

// Virtual for display address - formats address object into readable string
BuildingSchema.virtual('display_address').get(function() {
  if (!this.address) return '';

  // If address is a string (backward compatibility)
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
BuildingSchema.index({ building_name: 1 });
BuildingSchema.index({ building_code: 1 });
BuildingSchema.index({ site_id: 1 });
BuildingSchema.index({ customer_id: 1 });
BuildingSchema.index({ building_type: 1 });
BuildingSchema.index({ status: 1 });
BuildingSchema.index({ is_active: 1 });
BuildingSchema.index({ primary_use: 1 });
BuildingSchema.index({ last_inspection_date: 1 });
BuildingSchema.index({ accessibility_features: 1 });
BuildingSchema.index({ 'address.state': 1 });
BuildingSchema.index({ 'address.postcode': 1 });
BuildingSchema.index({ 'address.suburb': 1 });

// Compound indexes
BuildingSchema.index({ customer_id: 1, site_id: 1 });
BuildingSchema.index({ site_id: 1, status: 1 });
BuildingSchema.index({ building_type: 1, status: 1 });

// Ensure virtual fields are serialized and preserve unpopulated IDs
BuildingSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Preserve ObjectId if population returned null
    if (ret.site_id === null) {
      const originalId = doc.populated('site_id') || doc._doc?.site_id || doc.site_id;
      if (originalId) ret.site_id = originalId;
    }
    if (ret.customer_id === null) {
      const originalId = doc.populated('customer_id') || doc._doc?.customer_id || doc.customer_id;
      if (originalId) ret.customer_id = originalId;
    }
    return ret;
  }
});
BuildingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Building', BuildingSchema);