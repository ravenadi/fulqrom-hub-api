const mongoose = require('mongoose');

// Organisation schema
const OrganisationSchema = new mongoose.Schema({
  organisation_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  email_domain: {
    type: String,
    trim: true,
    match: /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/
  },
  logo_url: {
    type: String,
    trim: true,
    match: /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)$/i
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000
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
    trim: true,
    match: /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/ // ABN format with spaces
  },
  company_number: {
    type: String,
    trim: true,
    match: /^\d{3}\s?\d{3}\s?\d{3}$/ // ACN format with spaces
  },
  trading_name: {
    type: String,
    trim: true
  },
  industry_type: {
    type: String,
    enum: ['Technology', 'Healthcare', 'Government', 'Retail', 'Hospitality', 'Industrial', 'Service', 'Finance', 'Education']
  },
  organisation_size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+']
  }
}, { _id: false });

// Address schema
const AddressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 100
  },
  suburb: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  state: {
    type: String,
    required: true,
    enum: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']
  },
  postcode: {
    type: String,
    required: true,
    match: /^\d{4}$/ // Australian 4-digit postcodes
  }
}, { _id: false });

// Contact Method schema
const ContactMethodSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
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
    type: String,
    enum: ['Primary', 'Billing', 'Technical', 'General', 'Emergency', 'Project']
  },
  contact_type: {
    type: String,
    enum: ['Internal', 'External', 'Supplier', 'Customer', 'Contractor', 'Consultant', 'Emergency', 'Billing', 'Technical']
  },
  platform_access: {
    type: String,
    enum: ['Administrative', 'Operational', 'View Only', 'No Access']
  },
  method_type: {
    type: String,
    required: true,
    enum: ['Email', 'Phone', 'SMS', 'WhatsApp']
  },
  method_value: {
    type: String,
    required: true,
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
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

// Main Customer schema matching the API structure
const CustomerSchema = new mongoose.Schema({
  // Organisation Information
  organisation: {
    type: OrganisationSchema,
    required: true
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

// Add validation for unique ABN
CustomerSchema.index({ 'company_profile.business_number': 1 }, { unique: true, sparse: true });

// Pre-save middleware for ABN uniqueness validation
CustomerSchema.pre('save', async function(next) {
  if (this.company_profile?.business_number) {
    const existingCustomer = await this.constructor.findOne({
      'company_profile.business_number': this.company_profile.business_number,
      _id: { $ne: this._id }
    });

    if (existingCustomer) {
      const error = new Error('ABN already exists');
      error.code = 'DUPLICATE_ABN';
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Customer', CustomerSchema);