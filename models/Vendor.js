const mongoose = require('mongoose');

// Vendor License schema
// NOTE: Enum validations removed - values loaded from GET /api/dropdowns if needed
const VendorLicenseSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  number: {
    type: String,
    required: true,
    trim: true
  },
  issuingBody: {
    type: String,
    required: true,
    trim: true
  },
  issueDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    default: 'current'
  },
  documentUrl: {
    type: String,
    trim: true
  }
}, { _id: true });

// Vendor Insurance schema
// NOTE: Enum validations removed - values loaded from GET /api/dropdowns if needed
const VendorInsuranceSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true,
    trim: true
  },
  policyNumber: {
    type: String,
    required: true,
    trim: true
  },
  coverageAmount: {
    type: Number,
    required: true,
    min: 0
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    default: 'current'
  },
  documentUrl: {
    type: String,
    trim: true
  }
}, { _id: true });

// Vendor Certification schema
// NOTE: Enum validations removed - values loaded from GET /api/dropdowns if needed
const VendorCertificationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  issuingBody: {
    type: String,
    required: true,
    trim: true
  },
  certificationNumber: {
    type: String,
    required: true,
    trim: true
  },
  issueDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date
  },
  status: {
    type: String,
    default: 'current'
  },
  documentUrl: {
    type: String,
    trim: true
  }
}, { _id: true });

// Address schema
const VendorAddressSchema = new mongoose.Schema({
  street: {
    type: String,
    trim: true
  },
  suburb: {
    type: String,
    trim: true
  },
  // State - loaded from GET /api/dropdowns
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
  country: {
    type: String,
    default: 'Australia',
    trim: true
  }
}, { _id: false });

// Vendor Contact schema
const VendorContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  is_primary: {
    type: Boolean,
    default: false
  },
  is_emergency: {
    type: Boolean,
    default: false
  }
}, { _id: true });

// Main Vendor schema
const VendorSchema = new mongoose.Schema({
  // Core identification - renamed from 'name' to 'contractor_name'
  contractor_name: {
    type: String,
    required: [true, 'Contractor name is required'],
    trim: true,
    index: true
  },

  trading_name: {
    type: String,
    trim: true
  },

  abn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional
        const cleaned = v.replace(/\s/g, '');
        return /^\d{11}$/.test(cleaned);
      },
      message: 'ABN must be 11 digits'
    },
    index: true
  },

  gstRegistered: {
    type: Boolean,
    default: true
  },

  // Legacy email/phone fields (will be deprecated in favor of contacts array)
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },

  phone: {
    type: String,
    trim: true
  },

  website: {
    type: String,
    trim: true
  },

  address: {
    type: VendorAddressSchema,
    required: true
  },

  // Contractor Type - loaded from GET /api/dropdowns
  contractor_type: {
    type: String,
    required: [true, 'Contractor type is required'],
    index: true
  },

  // Consultant Specialisation - loaded from GET /api/dropdowns
  consultant_specialisation: {
    type: String
  },

  // Category - loaded from GET /api/dropdowns
  category: {
    type: String
  },

  subcategories: [{
    type: String,
    trim: true
  }],

  // Vendor Contacts (new centralized contact management)
  contacts: [VendorContactSchema],

  // Professional Registration & Certification
  professional_registration: {
    type: String,
    trim: true
  },

  building_consultant_id: {
    type: String,
    trim: true
  },

  building_consultant_registration: {
    type: String,
    trim: true
  },

  aibs_membership: {
    type: String,
    trim: true
  },

  // Certification authority - loaded from GET /api/dropdowns
  certification_authority: {
    type: String
  },

  // Insurance (simplified)
  insurance_details: {
    type: String,
    trim: true
  },

  insurance_coverage: {
    type: Number,
    min: 0
  },

  licence_numbers: {
    type: String,
    trim: true
  },

  // Services Provided
  services_provided: [{
    type: String,
    trim: true
  }],

  // Performance & Agreements
  performance_rating: {
    type: Number,
    min: 1,
    max: 5
  },

  preferred_provider: {
    type: Boolean,
    default: false
  },

  retainer_agreement: {
    type: Boolean,
    default: false
  },

  response_time_sla: {
    type: String,
    trim: true
  },

  annual_review_date: {
    type: Date
  },

  // Status - loaded from GET /api/dropdowns
  status: {
    type: String,
    default: 'active',
    index: true
  },

  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },

  totalJobs: {
    type: Number,
    default: 0,
    min: 0
  },

  completedJobs: {
    type: Number,
    default: 0,
    min: 0
  },

  averageCompletionTime: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Average time in hours'
  },

  onTimePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  // Australian Compliance
  licenses: [VendorLicenseSchema],
  insurances: [VendorInsuranceSchema],
  certifications: [VendorCertificationSchema],

  // Business Details - loaded from GET /api/dropdowns
  businessType: {
    type: String,
    required: [true, 'Business type is required']
  },

  yearsInBusiness: {
    type: Number,
    min: 0,
    default: 0
  },

  employeeCount: {
    type: String,
    trim: true
  },

  serviceAreas: [{
    type: String,
    trim: true
  }],

  // Financial
  hourlyRate: {
    type: Number,
    min: 0
  },

  preferredPaymentTerms: {
    type: String,
    default: '30 days',
    trim: true
  },

  // Metadata
  lastJobDate: {
    type: Date
  },

  notes: {
    type: String,
    trim: true
  },

  // System fields
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
VendorSchema.index({ contractor_name: 1 });
VendorSchema.index({ trading_name: 1 });
VendorSchema.index({ abn: 1 });
VendorSchema.index({ contractor_type: 1 });
VendorSchema.index({ consultant_specialisation: 1 });
VendorSchema.index({ status: 1 });
VendorSchema.index({ performance_rating: -1 });
VendorSchema.index({ preferred_provider: 1 });
VendorSchema.index({ 'contacts.email': 1 });
VendorSchema.index({ 'contacts.is_primary': 1 });
VendorSchema.index({ 'address.state': 1 });
VendorSchema.index({ is_active: 1 });
VendorSchema.index({ annual_review_date: 1 });

// Backward compatibility indexes
VendorSchema.index({ category: 1 });
VendorSchema.index({ rating: -1 });

// Text index for search functionality
VendorSchema.index({
  contractor_name: 'text',
  trading_name: 'text',
  'contacts.email': 'text',
  'address.suburb': 'text'
});

// Virtual for full address
VendorSchema.virtual('full_address').get(function() {
  const addr = this.address;
  if (!addr || !addr.street) return '';
  const parts = [];
  if (addr.street) parts.push(addr.street);
  if (addr.suburb) parts.push(addr.suburb);
  if (addr.state) parts.push(addr.state);
  if (addr.postcode) parts.push(addr.postcode);
  return parts.join(', ');
});

// Virtual for formatted ABN
VendorSchema.virtual('formatted_abn').get(function() {
  if (!this.abn) return '';
  const cleaned = this.abn.replace(/\s/g, '');
  // Format as XX XXX XXX XXX
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
});

// Virtual for completion rate
VendorSchema.virtual('completion_rate').get(function() {
  if (this.totalJobs === 0) return 0;
  return Math.round((this.completedJobs / this.totalJobs) * 100);
});

// Virtual for compliance status
VendorSchema.virtual('compliance_status').get(function() {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  // Check licenses
  const expiredLicenses = this.licenses.filter(lic => new Date(lic.expiryDate) < today);
  const expiringLicenses = this.licenses.filter(lic => {
    const expiry = new Date(lic.expiryDate);
    return expiry >= today && expiry <= thirtyDaysFromNow;
  });

  // Check insurances
  const expiredInsurances = this.insurances.filter(ins => new Date(ins.expiryDate) < today);
  const expiringInsurances = this.insurances.filter(ins => {
    const expiry = new Date(ins.expiryDate);
    return expiry >= today && expiry <= thirtyDaysFromNow;
  });

  return {
    licenses: {
      total: this.licenses.length,
      expired: expiredLicenses.length,
      expiring: expiringLicenses.length,
      current: this.licenses.length - expiredLicenses.length - expiringLicenses.length
    },
    insurances: {
      total: this.insurances.length,
      expired: expiredInsurances.length,
      expiring: expiringInsurances.length,
      current: this.insurances.length - expiredInsurances.length - expiringInsurances.length
    },
    certifications: {
      total: this.certifications.length
    },
    overall_status: (expiredLicenses.length > 0 || expiredInsurances.length > 0) ? 'non-compliant' :
                    (expiringLicenses.length > 0 || expiringInsurances.length > 0) ? 'expiring-soon' : 'compliant'
  };
});

// Ensure virtual fields are serialized
VendorSchema.set('toJSON', { virtuals: true });
VendorSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update compliance statuses and ensure only one primary contact
VendorSchema.pre('save', function(next) {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

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
        const contactObj = contact.toObject ? contact.toObject() : contact;
        return { ...contactObj, is_primary: false };
      });
    }
  }

  // Update license statuses
  this.licenses.forEach(license => {
    const expiryDate = new Date(license.expiryDate);
    if (expiryDate < today) {
      license.status = 'expired';
    } else if (expiryDate <= thirtyDaysFromNow) {
      license.status = 'expiring-soon';
    } else {
      license.status = 'current';
    }
  });

  // Update insurance statuses
  this.insurances.forEach(insurance => {
    const expiryDate = new Date(insurance.expiryDate);
    if (expiryDate < today) {
      insurance.status = 'expired';
    } else if (expiryDate <= thirtyDaysFromNow) {
      insurance.status = 'expiring-soon';
    } else {
      insurance.status = 'current';
    }
  });

  // Update certification statuses
  this.certifications.forEach(cert => {
    if (cert.expiryDate) {
      const expiryDate = new Date(cert.expiryDate);
      if (expiryDate < today) {
        cert.status = 'expired';
      } else if (expiryDate <= thirtyDaysFromNow) {
        cert.status = 'expiring-soon';
      } else {
        cert.status = 'current';
      }
    }
  });

  next();
});

module.exports = mongoose.model('Vendor', VendorSchema);
