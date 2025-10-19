const mongoose = require('mongoose');

// Plan schema for subscription plans (matches Laravel DR Plan model)
const PlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  plan_tier: {
    type: String,
    trim: true,
    enum: ['starter', 'professional', 'enterprise', 'custom']
  },
  slug: {
    type: String,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  is_default: {
    type: Boolean,
    default: false
  },
  time_period: {
    type: String,
    required: true,
    enum: ['monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  },
  trial_period_days: {
    type: Number,
    default: 0
  },
  sort_order: {
    type: Number,
    default: 0
  },
  // Essential restriction fields (like Laravel DR)
  max_users: {
    type: Number,
    default: null // null means unlimited
  },
  max_documents: {
    type: Number,
    default: null // null means unlimited
  },
  max_storage_gb: {
    type: Number,
    default: null // null means unlimited
  },
  features: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Audit fields
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  created_by: {
    type: String,
    trim: true
  }
}, {
  timestamps: false
});

// Pre-save middleware to update timestamps
PlanSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes
PlanSchema.index({ name: 1 });
PlanSchema.index({ plan_tier: 1 });
PlanSchema.index({ slug: 1 });
PlanSchema.index({ is_active: 1 });
PlanSchema.index({ is_default: 1 });
PlanSchema.index({ sort_order: 1 });
PlanSchema.index({ price: 1 });
PlanSchema.index({ created_at: -1 });

// Virtual for formatted price
PlanSchema.virtual('price_formatted').get(function() {
  return '$' + this.price.toFixed(2);
});

// Virtual for billing cycle display
PlanSchema.virtual('billing_display').get(function() {
  return `per ${this.time_period}`;
});

// Virtual for trial period display
PlanSchema.virtual('trial_period_label').get(function() {
  if (this.trial_period_days === 0) {
    return 'No Trial';
  }
  return this.trial_period_days + ' day' + (this.trial_period_days === 1 ? '' : 's') + ' trial';
});

// Virtual for tier label
PlanSchema.virtual('tier_label').get(function() {
  return this.plan_tier ? this.plan_tier.charAt(0).toUpperCase() + this.plan_tier.slice(1) : '';
});

// Virtual for display name
PlanSchema.virtual('display_name').get(function() {
  return this.name;
});

// Virtual for is active label
PlanSchema.virtual('is_active_label').get(function() {
  return this.is_active ? 'Active' : 'Inactive';
});

// Static method to get the default plan for registration (like Laravel DR)
PlanSchema.statics.getDefaultPlan = function() {
  return this.findOne({ is_active: true, is_default: true });
};

// Ensure only one default plan exists per tier (like Laravel DR)
PlanSchema.pre('save', function(next) {
  if (this.is_default && this.isModified('is_default')) {
    // Remove default flag from other plans of the same tier
    this.constructor.updateMany(
      { plan_tier: this.plan_tier, _id: { $ne: this._id } },
      { is_default: false }
    );
  }
  next();
});

// Ensure virtual fields are serialized
PlanSchema.set('toJSON', { virtuals: true });
PlanSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Plan', PlanSchema);
