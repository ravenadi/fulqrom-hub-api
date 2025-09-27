const mongoose = require('mongoose');

// Organisation schema
const OrganisationSchema = new mongoose.Schema({
  organisation_name: {
    type: String,
    trim: true
  },
  email_domain: {
    type: String,
    trim: true
  },
  logo_url: {
    type: String,
    trim: true
  },
  building_image: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

// Company Profile schema
const CompanyProfileSchema = new mongoose.Schema({
  business_number: {
    type: String,
    trim: true
  },
  company_number: {
    type: String,
    trim: true
  },
  trading_name: {
    type: String,
    trim: true
  },
  industry_type: {
    type: String
  },
  organisation_size: {
    type: String
  }
}, { _id: false });

// Address schema
const AddressSchema = new mongoose.Schema({
  street: {
    type: String,
    trim: true
  },
  suburb: {
    type: String,
    trim: true
  },
  state: {
    type: String
  },
  postcode: {
    type: String
  }
}, { _id: false });

// Contact Method schema
const ContactMethodSchema = new mongoose.Schema({
  full_name: {
    type: String,
    trim: true
  },
  job_title: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  role_type: {
    type: String
  },
  contact_type: {
    type: String
  },
  platform_access: {
    type: String
  },
  method_type: {
    type: String
  },
  method_value: {
    type: String,
    trim: true
  },
  label: {
    type: String,
    trim: true
  },
  is_primary: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Metadata Item schema
const MetadataItemSchema = new mongoose.Schema({
  key: {
    type: String,
    trim: true
  },
  value: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main Customer schema matching the API structure
const CustomerSchema = new mongoose.Schema({
  // Organisation Information
  organisation: {
    type: OrganisationSchema
  },

  // Company Profile Information
  company_profile: CompanyProfileSchema,

  // Address Information
  business_address: AddressSchema,
  postal_address: AddressSchema,

  // Contact Information
  contact_methods: [ContactMethodSchema],

  // Additional Information
  metadata: [MetadataItemSchema],

  // System fields
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
CustomerSchema.index({ 'organisation.organisation_name': 1 });
CustomerSchema.index({ 'company_profile.business_number': 1 });
CustomerSchema.index({ 'company_profile.company_number': 1 });
CustomerSchema.index({ 'is_active': 1 });
CustomerSchema.index({ 'business_address.state': 1, 'business_address.postcode': 1 });
CustomerSchema.index({ 'organisation.email_domain': 1 });
CustomerSchema.index({ 'company_profile.industry_type': 1 });

// Virtual for full business address
CustomerSchema.virtual('full_business_address').get(function() {
  const addr = this.business_address;
  if (!addr || !addr.street) return '';
  return `${addr.street}, ${addr.suburb}, ${addr.state} ${addr.postcode}`;
});

// Virtual for full postal address
CustomerSchema.virtual('full_postal_address').get(function() {
  const addr = this.postal_address;
  if (!addr || !addr.street) return '';
  return `${addr.street}, ${addr.suburb}, ${addr.state} ${addr.postcode}`;
});

// Virtual for primary contact
CustomerSchema.virtual('primary_contact').get(function() {
  return this.contact_methods?.find(contact => contact.is_primary) || this.contact_methods?.[0];
});

// Virtual for display name (for backwards compatibility)
CustomerSchema.virtual('display_name').get(function() {
  return this.organisation?.organisation_name || 'Unknown Organisation';
});

// Virtual for ABN (for backwards compatibility)
CustomerSchema.virtual('abn_display').get(function() {
  return this.company_profile?.business_number || '';
});

// Ensure virtual fields are serialized
CustomerSchema.set('toJSON', { virtuals: true });
CustomerSchema.set('toObject', { virtuals: true });

// Remove unique ABN validation for flexibility

module.exports = mongoose.model('Customer', CustomerSchema);