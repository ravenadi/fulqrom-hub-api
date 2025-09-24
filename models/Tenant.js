const mongoose = require('mongoose');

// Emergency Contact schema
const EmergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  relationship: {
    type: String,
    trim: true
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
    trim: true
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
  number_of_employees: {
    type: Number
  },
  allocated_parking_spaces: {
    type: Number
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
    type: String,
    trim: true
  },

  // Financial
  rental_rate: {
    type: Number
  },
  rental_rate_unit: {
    type: String,
    default: 'per sqm/year'
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
  notes: {
    type: String,
    trim: true
  },
  compliance_notes: {
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

// Virtual for lease status
TenantSchema.virtual('lease_status').get(function() {
  if (!this.lease_end_date) return 'No End Date';

  const today = new Date();
  const endDate = new Date(this.lease_end_date);
  const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return 'Expired';
  if (daysUntilExpiry <= 30) return 'Expiring Soon';
  if (daysUntilExpiry <= 90) return 'Expiring';
  return 'Active';
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

// Pre-save middleware to calculate lease duration
TenantSchema.pre('save', function(next) {
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

// Compound indexes
TenantSchema.index({ building_id: 1, floor_id: 1 });
TenantSchema.index({ customer_id: 1, building_id: 1 });
TenantSchema.index({ site_id: 1, building_id: 1 });

// Ensure virtual fields are serialized
TenantSchema.set('toJSON', { virtuals: true });
TenantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tenant', TenantSchema, 'building_tenants');