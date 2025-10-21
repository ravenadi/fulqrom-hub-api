const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Resource Access schema (embedded in User)
const ResourceAccessSchema = new mongoose.Schema({
  resource_type: {
    type: String,
    required: true,
    enum: ['org', 'site', 'building', 'floor', 'tenant', 'document', 'asset', 'vendor', 'customer', 'user', 'analytics'],
    trim: true
  },
  resource_id: {
    type: String,
    required: true,
    trim: true
  },
  resource_name: {
    type: String,
    trim: true
  },
  // Fine-grained permissions for this specific resource
  permissions: {
    can_view: {
      type: Boolean,
      default: true
    },
    can_create: {
      type: Boolean,
      default: false
    },
    can_edit: {
      type: Boolean,
      default: false
    },
    can_delete: {
      type: Boolean,
      default: false
    }
  },
  granted_at: {
    type: Date,
    default: Date.now
  },
  granted_by: {
    type: String,
    trim: true
  }
}, { _id: true });

// Main User schema
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  full_name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  auth0_id: {
    type: String,
    trim: true,
    sparse: true
  },
  custom_id: {
    type: String,
    trim: true,
    sparse: true
  },
  is_active: {
    type: Boolean,
    default: true
  },

  // Roles (many-to-many using array of role IDs)
  role_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],

  // Resource access assignments
  resource_access: [ResourceAccessSchema],

  // Audit fields
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  deactivated_at: {
    type: Date
  },
  deactivated_by: {
    type: String,
    trim: true
  }
}, {
  timestamps: false
});

// Pre-save middleware to update timestamps
UserSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ auth0_id: 1 }, { sparse: true });
UserSchema.index({ custom_id: 1 }, { sparse: true });
UserSchema.index({ is_active: 1 });
UserSchema.index({ role_ids: 1 });
UserSchema.index({ created_at: -1 });
UserSchema.index({ 'resource_access.resource_type': 1 });
UserSchema.index({ 'resource_access.resource_id': 1 });

// Virtual for display name
UserSchema.virtual('display_name').get(function() {
  return this.full_name;
});

// Ensure virtual fields are serialized
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Apply tenant plugin for multi-tenancy support
UserSchema.plugin(tenantPlugin);

module.exports = mongoose.model('User', UserSchema);
