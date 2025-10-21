const mongoose = require('mongoose');

/**
 * Company Profile model
 * Stores company-specific information that can be referenced by other models
 */
const CompanyProfileSchema = new mongoose.Schema({
  business_number: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional business number validation
        return !v || /^\d{11}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Business number must be 11 digits'
    },
    index: true
  },
  company_number: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional company number validation
        return !v || /^\d{9}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Company number must be 9 digits'
    },
    index: true
  },
  trading_name: {
    type: String,
    trim: true,
    index: true
  },
  industry_type: {
    type: String,
    trim: true
  },
  organisation_size: {
    type: String,
    enum: ['micro', 'small', 'medium', 'large', 'enterprise'],
    default: 'small'
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
  timestamps: false
});

// Pre-save middleware to update updated_at
CompanyProfileSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes
CompanyProfileSchema.index({ business_number: 1 });
CompanyProfileSchema.index({ company_number: 1 });
CompanyProfileSchema.index({ trading_name: 1 });
CompanyProfileSchema.index({ industry_type: 1 });

// Virtual for display name
CompanyProfileSchema.virtual('display_name').get(function() {
  return this.trading_name || 'Company Profile';
});

// Ensure virtual fields are serialized
CompanyProfileSchema.set('toJSON', { virtuals: true });
CompanyProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CompanyProfile', CompanyProfileSchema);
