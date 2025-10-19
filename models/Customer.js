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

// Individual Contact Method schema (nested within contact)
const IndividualMethodSchema = new mongoose.Schema({
  method_type: {
    type: String,
    required: true
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
}, { _id: true });

// Contact schema with multiple methods
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
  contact_methods: [IndividualMethodSchema],
  // Legacy fields for backward compatibility
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

// Pre-save middleware to ensure only one primary method per contact
ContactMethodSchema.pre('save', function(next) {
  // Handle primary validation for contact_methods array
  if (this.contact_methods && this.contact_methods.length > 0) {
    const primaryMethods = this.contact_methods.filter(method => method.is_primary);

    // If multiple primary methods, keep only the first one
    if (primaryMethods.length > 1) {
      this.contact_methods.forEach((method, index) => {
        if (index > 0 && method.is_primary) {
          method.is_primary = false;
        }
      });
    }
  }

  next();
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
  },

  // Subscription/Plan fields (like Laravel DR Tenant model)
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    default: null
  },
  plan_start_date: {
    type: Date,
    default: null
  },
  plan_end_date: {
    type: Date,
    default: null
  },
  is_trial: {
    type: Boolean,
    default: true
  },
  trial_start_date: {
    type: Date,
    default: null
  },
  trial_end_date: {
    type: Date,
    default: null
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
// Subscription/Plan indexes
CustomerSchema.index({ 'plan_id': 1 });
CustomerSchema.index({ 'plan_start_date': 1 });
CustomerSchema.index({ 'plan_end_date': 1 });
CustomerSchema.index({ 'is_trial': 1 });
CustomerSchema.index({ 'trial_start_date': 1 });
CustomerSchema.index({ 'trial_end_date': 1 });

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

// Virtual for subscription status (like Laravel DR Tenant model)
CustomerSchema.virtual('is_active_label').get(function() {
  return this.is_active ? 'Active' : 'Inactive';
});

CustomerSchema.virtual('is_trial_label').get(function() {
  return this.is_trial ? 'Trial' : 'Paid';
});

CustomerSchema.virtual('has_plan').get(function() {
  return this.plan_id !== null;
});

// Ensure virtual fields are serialized
CustomerSchema.set('toJSON', { virtuals: true });
CustomerSchema.set('toObject', { virtuals: true });

// Remove unique ABN validation for flexibility

module.exports = mongoose.model('Customer', CustomerSchema);