const mongoose = require('mongoose');

// Emergency Contact schema
const EmergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: true
  },
  phone: {
    type: String,
    trim: true,
    required: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  relationship: {
    type: String,
    trim: true
  }
}, { _id: false });

// Contact schema for multiple contacts with primary toggle
const ContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  is_primary: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Main Tenant schema
const TenantSchema = new mongoose.Schema({
  // Location
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

  // Tenant Details
  tenant_name: {
    type: String,
    trim: true
  },
  tenant_legal_name: {
    type: String,
    trim: true
  },
  tenant_trading_name: {
    type: String,
    trim: true
  },
  abn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\d{11}$/.test(v);
      },
      message: 'ABN must be exactly 11 digits'
    }
  },
  acn: {
    type: String,
    trim: true
  },

  // Lease Information
  lease_type: {
    type: String,
    trim: true
  },
  lease_start_date: {
    type: Date
  },
  lease_end_date: {
    type: Date
  },
  lease_duration_months: {
    type: Number
  },

  // Operational Details
  occupied_area: {
    type: Number
  },
  occupied_area_unit: {
    type: String,
    default: 'm²'
  },
  area_sqm: {
    type: Number
  },
  number_of_employees: {
    type: Number
  },
  allocated_parking_spaces: {
    type: Number
  },
  location: {
    floor: {
      type: String,
      trim: true
    },
    suite: {
      type: String,
      trim: true
    },
    room: {
      type: String,
      trim: true
    }
  },
  operating_hours_start: {
    type: String,
    trim: true
  },
  operating_hours_end: {
    type: String,
    trim: true
  },
  operating_days: {
    type: String,
    trim: true
  },

  // Contact Information
  contact_details: {
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
    }
  },
  primary_contact_name: {
    type: String,
    trim: true
  },
  primary_contact_title: {
    type: String,
    trim: true
  },
  primary_contact_phone: {
    type: String,
    trim: true
  },
  primary_contact_email: {
    type: String,
    trim: true
  },
  billing_contact_name: {
    type: String,
    trim: true
  },
  billing_contact_email: {
    type: String,
    trim: true
  },

  // Emergency Contacts
  emergency_contacts: [EmergencyContactSchema],

  // Business Classification
  industry_type: {
    type: String,
    trim: true
  },
  industry: {
    type: String,
    trim: true
  },
  business_category: {
    type: String,
    trim: true
  },
  occupancy_classification: {
    type: String,
    trim: true
  },

  // Utilities & Services
  utilities_included: {
    type: [String]
  },
  services_included: {
    type: [String]
  },
  special_requirements: {
    type: [String],
    default: [],
    enum: ['24_7_access', 'high_security', 'loading_dock', 'after_hours_hvac', 'dedicated_parking', 'signage_rights', 'kitchen_facilities', 'server_room']
  },

  // Business hours - consolidated from operating_hours_start/end
  business_hours: {
    start: {
      type: String,
      trim: true
    },
    end: {
      type: String,
      trim: true
    }
  },

  // Multiple contacts with primary designation
  contacts: [ContactSchema],

  // Employee count (alias/replacement for number_of_employees)
  employee_count: {
    type: Number,
    min: 0
  },

  // Parking allocation (alias/replacement for allocated_parking_spaces)
  parking_allocation: {
    type: Number,
    min: 0
  },

  // Financial
  rental_rate: {
    type: Number
  },
  rental_rate_unit: {
    type: String,
    default: 'per sqm/year'
  },
  rent_amount: {
    type: Number
  },
  rent_frequency: {
    type: String,
    trim: true
  },
  bond_amount: {
    type: Number
  },
  outgoings_estimate: {
    type: Number
  },

  // Status & Management
  tenant_status: {
    type: String,
    trim: true,
    default: 'Active'
  },
  move_in_date: {
    type: Date
  },
  move_out_date: {
    type: Date
  },

  // Additional Information
  metadata: [{
    key: {
      type: String,
      trim: true
    },
    value: {
      type: String,
      trim: true
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  compliance_notes: {
    type: String,
    trim: true
  },
  formatted_created_date: {
    type: String,
    trim: true
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
TenantSchema.virtual('display_name').get(function() {
  return this.tenant_trading_name || this.tenant_legal_name || 'Unnamed Tenant';
});


// Virtual for formatted area
TenantSchema.virtual('formatted_area').get(function() {
  if (this.occupied_area) {
    return `${this.occupied_area.toLocaleString()} ${this.occupied_area_unit || 'm²'}`;
  }
  return 'N/A';
});

// Virtual for operating hours display
TenantSchema.virtual('operating_hours_display').get(function() {
  if (this.operating_hours_start && this.operating_hours_end) {
    return `${this.operating_hours_start} - ${this.operating_hours_end}`;
  }
  return 'N/A';
});

// Virtual for lease duration display
TenantSchema.virtual('lease_duration_display').get(function() {
  if (this.lease_start_date && this.lease_end_date) {
    const start = new Date(this.lease_start_date);
    const end = new Date(this.lease_end_date);
    const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30));
    return `${months} months`;
  }
  return 'N/A';
});

// Virtual for getting primary contact
TenantSchema.virtual('primary_contact').get(function() {
  if (this.contacts && this.contacts.length > 0) {
    return this.contacts.find(c => c.is_primary) || this.contacts[0];
  }
  return null;
});

// Pre-save middleware to calculate lease duration and ensure only one primary contact
TenantSchema.pre('save', function(next) {
  // Ensure only one primary contact
  if (this.contacts && this.contacts.length > 0) {
    const primaryContacts = this.contacts.filter(c => c.is_primary);
    if (primaryContacts.length > 1) {
      // Keep only the first primary, set others to false
      let foundPrimary = false;
      this.contacts = this.contacts.map(contact => {
        if (contact.is_primary && !foundPrimary) {
          foundPrimary = true;
          return contact;
        }
        return { ...contact.toObject ? contact.toObject() : contact, is_primary: false };
      });
    }
  }

  // Calculate lease duration
  if (this.lease_start_date && this.lease_end_date) {
    const start = new Date(this.lease_start_date);
    const end = new Date(this.lease_end_date);
    this.lease_duration_months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30));
  }

  next();
});

// Indexes for performance
TenantSchema.index({ tenant_legal_name: 1 });
TenantSchema.index({ tenant_trading_name: 1 });
TenantSchema.index({ abn: 1 });
TenantSchema.index({ site_id: 1 });
TenantSchema.index({ building_id: 1 });
TenantSchema.index({ floor_id: 1 });
TenantSchema.index({ customer_id: 1 });
TenantSchema.index({ tenant_status: 1 });
TenantSchema.index({ lease_end_date: 1 });
TenantSchema.index({ is_active: 1 });
TenantSchema.index({ 'contacts.email': 1 });
TenantSchema.index({ 'contacts.is_primary': 1 });
TenantSchema.index({ special_requirements: 1 });

// Compound indexes
TenantSchema.index({ building_id: 1, floor_id: 1 });
TenantSchema.index({ customer_id: 1, building_id: 1 });
TenantSchema.index({ site_id: 1, building_id: 1 });

// Ensure virtual fields are serialized and preserve unpopulated IDs
TenantSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Preserve ObjectId if population returned null
    if (ret.customer_id === null && doc._doc.customer_id) {
      ret.customer_id = doc._doc.customer_id;
    }
    if (ret.site_id === null && doc._doc.site_id) {
      ret.site_id = doc._doc.site_id;
    }
    if (ret.building_id === null && doc._doc.building_id) {
      ret.building_id = doc._doc.building_id;
    }
    if (ret.floor_id === null && doc._doc.floor_id) {
      ret.floor_id = doc._doc.floor_id;
    }
    return ret;
  }
});
TenantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tenant', TenantSchema, 'building_tenants');