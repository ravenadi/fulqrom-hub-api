const mongoose = require('mongoose');

/**
 * Organization Schema
 *
 * Stores SaaS subscription details for a tenant.
 * This is a 1-to-1 relationship with Tenant model.
 * Organization contains billing, subscription, and plan information.
 */
const OrganizationSchema = new mongoose.Schema({
  // Reference to master Tenant
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true
  },
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
    index: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9-]+$/,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  phone: {
    type: String,
    trim: true
  },

  // Australian Business Details
  abn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\d{11}$/.test(v);
      },
      message: 'ABN must be 11 digits'
    }
  },
  acn: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\d{9}$/.test(v);
      },
      message: 'ACN must be 9 digits'
    }
  },

  // Address
  address: {
    street: { type: String, trim: true },
    suburb: { type: String, trim: true },
    state: {
      type: String,
      enum: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', ''],
      default: ''
    },
    postcode: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^\d{4}$/.test(v);
        },
        message: 'Postcode must be 4 digits'
      }
    },
    country: { type: String, default: 'Australia' }
  },

  // Subscription & Plan
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['trial', 'active', 'suspended', 'cancelled'],
    default: 'trial',
    index: true
  },

  // Trial Management
  trial_ends_at: {
    type: Date,
    default: function() {
      // Default trial period: 14 days from creation
      const trialDate = new Date();
      trialDate.setDate(trialDate.getDate() + 14);
      return trialDate;
    }
  },

  // Usage Limits (from subscription plan)
  limits: {
    users: {
      type: Number,
      default: 5
    },
    buildings: {
      type: Number,
      default: 10
    },
    sites: {
      type: Number,
      default: 5
    },
    storage_gb: {
      type: Number,
      default: 10
    }
  },

  // Current Usage Tracking
  current_usage: {
    users: {
      type: Number,
      default: 0
    },
    buildings: {
      type: Number,
      default: 0
    },
    sites: {
      type: Number,
      default: 0
    },
    storage_bytes: {
      type: Number,
      default: 0
    }
  },

  // Branding & Customization
  branding: {
    logo_url: { type: String },
    primary_colour: { type: String, default: 'oklch(0.6 0.15 180)' },
    secondary_colour: { type: String }
  },

  // Settings
  settings: {
    timezone: { type: String, default: 'Australia/Sydney' },
    date_format: { type: String, default: 'DD/MM/YYYY' },
    currency: { type: String, default: 'AUD' },
    enable_analytics: { type: Boolean, default: true },
    enable_notifications: { type: Boolean, default: true }
  },

  // Billing Information
  billing: {
    billing_email: { type: String },
    billing_contact_name: { type: String },
    billing_phone: { type: String },
    payment_method: {
      type: String,
      enum: ['credit_card', 'direct_debit', 'invoice', ''],
      default: ''
    },
    next_billing_date: { type: Date }
  },

  // Owner (First user who created the tenant)
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },

  // Status flags
  is_active: {
    type: Boolean,
    default: true,
    index: true
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
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: false, // We manage timestamps manually
  collection: 'tenant_organisations'
});

// Indexes
OrganizationSchema.index({ name: 1 });
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ status: 1, is_active: 1 });
OrganizationSchema.index({ plan_id: 1 });
OrganizationSchema.index({ owner_id: 1 });
OrganizationSchema.index({ created_at: -1 });
OrganizationSchema.index({ trial_ends_at: 1 });

// Virtual: Storage in GB
OrganizationSchema.virtual('storage_used_gb').get(function() {
  return (this.current_usage.storage_bytes / (1024 * 1024 * 1024)).toFixed(2);
});

// Virtual: Trial status
OrganizationSchema.virtual('is_trial_active').get(function() {
  if (this.status !== 'trial') return false;
  return new Date() < this.trial_ends_at;
});

// Virtual: Days remaining in trial
OrganizationSchema.virtual('trial_days_remaining').get(function() {
  if (this.status !== 'trial') return 0;
  const now = new Date();
  const diff = this.trial_ends_at - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Virtual: Usage percentage for users
OrganizationSchema.virtual('users_usage_percent').get(function() {
  if (this.limits.users === 0) return 0;
  return Math.round((this.current_usage.users / this.limits.users) * 100);
});

// Virtual: Usage percentage for buildings
OrganizationSchema.virtual('buildings_usage_percent').get(function() {
  if (this.limits.buildings === 0) return 0;
  return Math.round((this.current_usage.buildings / this.limits.buildings) * 100);
});

// Virtual: Usage percentage for storage
OrganizationSchema.virtual('storage_usage_percent').get(function() {
  if (this.limits.storage_gb === 0) return 0;
  const storageGb = this.current_usage.storage_bytes / (1024 * 1024 * 1024);
  return Math.round((storageGb / this.limits.storage_gb) * 100);
});

// Ensure virtual fields are serialized
OrganizationSchema.set('toJSON', { virtuals: true });
OrganizationSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update timestamps
OrganizationSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Pre-save middleware to generate slug from name if not provided
OrganizationSchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Instance method: Check if organization can add more users
OrganizationSchema.methods.canAddUsers = function(count = 1) {
  return this.current_usage.users + count <= this.limits.users;
};

// Instance method: Check if organization can add more buildings
OrganizationSchema.methods.canAddBuildings = function(count = 1) {
  return this.current_usage.buildings + count <= this.limits.buildings;
};

// Instance method: Check if organization can add more sites
OrganizationSchema.methods.canAddSites = function(count = 1) {
  return this.current_usage.sites + count <= this.limits.sites;
};

// Instance method: Check if organization has storage available
OrganizationSchema.methods.canAddStorage = function(bytes) {
  const currentGb = this.current_usage.storage_bytes / (1024 * 1024 * 1024);
  const additionalGb = bytes / (1024 * 1024 * 1024);
  return currentGb + additionalGb <= this.limits.storage_gb;
};

// Instance method: Increment user count
OrganizationSchema.methods.incrementUserCount = async function() {
  this.current_usage.users += 1;
  return this.save();
};

// Instance method: Decrement user count
OrganizationSchema.methods.decrementUserCount = async function() {
  this.current_usage.users = Math.max(0, this.current_usage.users - 1);
  return this.save();
};

// Instance method: Update usage counts
OrganizationSchema.methods.updateUsage = async function(usageType, value) {
  if (this.current_usage.hasOwnProperty(usageType)) {
    this.current_usage[usageType] = value;
    return this.save();
  }
  throw new Error(`Invalid usage type: ${usageType}`);
};

// Static method: Find active organizations
OrganizationSchema.statics.findActive = function() {
  return this.find({
    is_active: true,
    status: { $in: ['trial', 'active'] }
  });
};

// Static method: Find organizations with expiring trials
OrganizationSchema.statics.findExpiringTrials = function(daysThreshold = 3) {
  const now = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  return this.find({
    status: 'trial',
    is_active: true,
    trial_ends_at: { $gte: now, $lte: thresholdDate }
  });
};

// Static method: Find organizations by owner
OrganizationSchema.statics.findByOwner = function(ownerId) {
  return this.find({ owner_id: ownerId, is_active: true });
};

module.exports = mongoose.model('Organization', OrganizationSchema);
