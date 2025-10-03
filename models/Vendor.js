const mongoose = require('mongoose');

// Vendor License schema
const VendorLicenseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['electrical', 'plumbing', 'gas-fitting', 'fire-safety', 'builders', 'asbestos-removal', 'refrigeration', 'crane-operator', 'scaffolding', 'demolition', 'other'],
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
    enum: ['current', 'expiring-soon', 'expired', 'pending', 'not-required'],
    default: 'current'
  },
  documentUrl: {
    type: String,
    trim: true
  }
}, { _id: true });

// Vendor Insurance schema
const VendorInsuranceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['public-liability', 'professional-indemnity', 'workers-compensation', 'product-liability', 'directors-officers', 'cyber-liability'],
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
    enum: ['current', 'expiring-soon', 'expired', 'pending', 'not-required'],
    default: 'current'
  },
  documentUrl: {
    type: String,
    trim: true
  }
}, { _id: true });

// Vendor Certification schema
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
    enum: ['current', 'expiring-soon', 'expired', 'pending', 'not-required'],
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
  country: {
    type: String,
    default: 'Australia',
    trim: true
  }
}, { _id: false });

// Main Vendor schema
const VendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true,
    index: true
  },

  abn: {
    type: String,
    required: [true, 'ABN is required'],
    trim: true,
    validate: {
      validator: function(v) {
        // Remove spaces and validate 11 digits
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

  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    },
    index: true
  },

  phone: {
    type: String,
    required: [true, 'Phone number is required'],
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

  category: {
    type: String,
    enum: ['fire-safety', 'hvac', 'electrical', 'plumbing', 'cleaning', 'security', 'maintenance', 'construction', 'landscaping', 'pest-control', 'other'],
    required: [true, 'Category is required'],
    index: true
  },

  subcategories: [{
    type: String,
    trim: true
  }],

  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending-approval', 'under-review'],
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

  // Business Details
  businessType: {
    type: String,
    enum: ['sole-trader', 'partnership', 'company', 'trust', 'other'],
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
VendorSchema.index({ name: 1 });
VendorSchema.index({ abn: 1 });
VendorSchema.index({ email: 1 });
VendorSchema.index({ category: 1 });
VendorSchema.index({ status: 1 });
VendorSchema.index({ rating: -1 });
VendorSchema.index({ 'address.state': 1 });
VendorSchema.index({ is_active: 1 });

// Text index for search functionality
VendorSchema.index({
  name: 'text',
  email: 'text',
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

// Pre-save middleware to update compliance statuses
VendorSchema.pre('save', function(next) {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

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
