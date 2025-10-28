const mongoose = require('mongoose');

/**
 * New simplified Tenant model
 * This replaces the complex Customer model with a streamlined tenant structure
 * 
 * Fields:
 * - tenant_name: The display name of the tenant
 * - phone: Contact phone number
 * - status: Current status (active, inactive, suspended, trial)
 * - plan_id: Reference to the subscription plan
 * - created_at, updated_at: Timestamps
 */
const TenantSchema = new mongoose.Schema({
  tenant_name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Optional phone validation - can be empty
        return !v || /^[\+]?[1-9][\d]{0,15}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'suspended', 'trial'],
    default: 'trial',
    index: true
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    default: null,
    index: true
  },
  // Plan Status Information
  plan_status: {
    is_active: {
      type: Boolean,
      default: true
    },
    is_trial: {
      type: Boolean,
      default: false
    },
    plan_start_date: {
      type: Date,
      default: null
    },
    plan_end_date: {
      type: Date,
      default: null
    },
    trial_start_date: {
      type: Date,
      default: null
    },
    trial_end_date: {
      type: Date,
      default: null
    }
  },
  // S3 Bucket Information
  s3_bucket_name: {
    type: String,
    trim: true,
    index: true
  },
  s3_bucket_region: {
    type: String,
    default: 'ap-southeast-2',
    trim: true
  },
  s3_bucket_status: {
    type: String,
    enum: ['created', 'pending', 'failed', 'not_created'],
    default: 'not_created'
  },
  // Audit fields
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false // We're using custom timestamp fields
});

// Pre-save middleware to update updated_at
TenantSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes for performance
TenantSchema.index({ tenant_name: 1 });
TenantSchema.index({ status: 1 });
TenantSchema.index({ plan_id: 1 });
TenantSchema.index({ created_at: -1 });
TenantSchema.index({ updated_at: -1 });

// Virtual for display name
TenantSchema.virtual('display_name').get(function() {
  return this.tenant_name;
});

// Virtual for status label
TenantSchema.virtual('status_label').get(function() {
  const labels = {
    active: 'Active',
    inactive: 'Inactive', 
    suspended: 'Suspended',
    trial: 'Trial'
  };
  return labels[this.status] || 'Unknown';
});

// Virtual for is_active (for backward compatibility)
TenantSchema.virtual('is_active').get(function() {
  return this.status === 'active';
});

// Virtual for is_active_label (for backward compatibility)
TenantSchema.virtual('is_active_label').get(function() {
  return this.status_label;
});

// Ensure virtual fields are serialized
TenantSchema.set('toJSON', { virtuals: true });
TenantSchema.set('toObject', { virtuals: true });

const Tenant = mongoose.model('Tenant', TenantSchema);

// Setup audit hooks
const { setupAuditHooks, addAuditContextHelper } = require('../utils/auditHook');
addAuditContextHelper(Tenant);
setupAuditHooks(Tenant, { module: 'tenant' });

module.exports = Tenant;
