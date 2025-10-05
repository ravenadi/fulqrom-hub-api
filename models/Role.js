const mongoose = require('mongoose');

// Role Permission schema (embedded in Role)
const RolePermissionSchema = new mongoose.Schema({
  module_name: {
    type: String,
    required: true,
    enum: ['customers', 'sites', 'buildings', 'floors', 'assets', 'tenants', 'documents', 'vendors', 'users', 'roles'],
    trim: true
  },
  can_view: {
    type: Boolean,
    default: false
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
}, { _id: false });

// Main Role schema
const RoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  permissions: [RolePermissionSchema],

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

// Pre-save middleware to update timestamps
RoleSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes
RoleSchema.index({ name: 1 });
RoleSchema.index({ is_active: 1 });
RoleSchema.index({ created_at: -1 });

// Virtual to get user count (populated separately in API)
RoleSchema.virtual('user_count', {
  ref: 'User',
  localField: '_id',
  foreignField: 'role_ids',
  count: true
});

// Ensure virtual fields are serialized
RoleSchema.set('toJSON', { virtuals: true });
RoleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Role', RoleSchema);
