const mongoose = require('mongoose');

/**
 * Tenant Organization model
 * This stores detailed organization information for each tenant
 * 
 * Fields:
 * - tenant_id: Reference to the tenant
 * - organisation_name: Legal business name (required)
 * - business_address_id: Reference to addresses table
 * - company_profile_id: Reference to company_profiles table  
 * - postal_address_id: Reference to addresses table
 * - email_domain: Organization email domain
 * - organisation_abn: Australian Business Number
 * - organisation_acn: Australian Company Number
 * - trading_name: Trading name (may differ from legal name)
 * - note: Additional notes
 */
const TenantOrgSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  organisation_name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  business_address_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    default: null
  },
  company_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    default: null
  },
  postal_address_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    default: null
  },
  email_domain: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional email domain validation
        return !v || /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,})$/.test(v);
      },
      message: 'Please enter a valid email domain'
    },
    index: true
  },
  organisation_abn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional ABN validation (11 digits)
        return !v || /^\d{11}$/.test(v.replace(/\s/g, ''));
      },
      message: 'ABN must be 11 digits'
    },
    index: true
  },
  organisation_acn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional ACN validation (9 digits)
        return !v || /^\d{9}$/.test(v.replace(/\s/g, ''));
      },
      message: 'ACN must be 9 digits'
    },
    index: true
  },
  trading_name: {
    type: String,
    trim: true,
    index: true
  },
  note: {
    type: String,
    trim: true
  },
  // Audit fields
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false // We're using custom timestamp fields
});

// Pre-save middleware to update updated_at
TenantOrgSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes for performance
TenantOrgSchema.index({ tenant_id: 1 });
TenantOrgSchema.index({ organisation_name: 1 });
TenantOrgSchema.index({ email_domain: 1 });
TenantOrgSchema.index({ organisation_abn: 1 });
TenantOrgSchema.index({ organisation_acn: 1 });
TenantOrgSchema.index({ trading_name: 1 });

// Ensure one organization per tenant
TenantOrgSchema.index({ tenant_id: 1 }, { unique: true });

// Virtual for display name
TenantOrgSchema.virtual('display_name').get(function() {
  return this.trading_name || this.organisation_name;
});

// Virtual for legal name
TenantOrgSchema.virtual('legal_name').get(function() {
  return this.organisation_name;
});

// Ensure virtual fields are serialized
TenantOrgSchema.set('toJSON', { virtuals: true });
TenantOrgSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TenantOrg', TenantOrgSchema);
