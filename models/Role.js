const mongoose = require('mongoose');

// Permission schema for each entity/module
const PermissionSchema = new mongoose.Schema({
  entity: {
    type: String,
    required: true,
    enum: [ 'sites', 'buildings', 'floors', 'tenants', 'documents', 'assets', 'vendors', 'customers', 'users', 'analytics', 'organisations'],
    trim: true
  },
  view: {
    type: Boolean,
    default: false
  },
  create: {
    type: Boolean,
    default: false
  },
  edit: {
    type: Boolean,
    default: false
  },
  delete: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Main Role schema for v2 API
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
  permissions: [PermissionSchema],
  
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

// Static method to get predefined roles with their permissions
RoleSchema.statics.getPredefinedRoles = function() {
  return [
    {
      name: 'Admin',
      description: 'Full system access with all permissions',
      permissions: [
        { entity: 'sites', view: true, create: true, edit: true, delete: true },
        { entity: 'buildings', view: true, create: true, edit: true, delete: true },
        { entity: 'floors', view: true, create: true, edit: true, delete: true },
        { entity: 'tenants', view: true, create: true, edit: true, delete: true },
        { entity: 'documents', view: true, create: true, edit: true, delete: true },
        { entity: 'assets', view: true, create: true, edit: true, delete: true },
        { entity: 'vendors', view: true, create: true, edit: true, delete: true },
        { entity: 'customers', view: true, create: true, edit: true, delete: true },
        { entity: 'users', view: true, create: true, edit: true, delete: true },
        { entity: 'analytics', view: true, create: true, edit: true, delete: true }
      ]
    },
    {
      name: 'Property Manager',
      description: 'Property management with access to sites, buildings, floors, tenants, documents, assets, vendors, customers, users, and analytics',
      permissions: [
        { entity: 'sites', view: true, create: true, edit: true, delete: true },
        { entity: 'buildings', view: true, create: true, edit: true, delete: true },
        { entity: 'floors', view: true, create: true, edit: true, delete: true },
        { entity: 'tenants', view: true, create: true, edit: true, delete: true },
        { entity: 'documents', view: true, create: true, edit: true, delete: true },
        { entity: 'assets', view: true, create: true, edit: true, delete: true },
        { entity: 'vendors', view: true, create: true, edit: true, delete: true },
        { entity: 'customers', view: true, create: true, edit: true, delete: true },
        { entity: 'users', view: true, create: true, edit: true, delete: true },
        { entity: 'analytics', view: true, create: true, edit: true, delete: true }
      ]
    },
    {
      name: 'Building Manager',
      description: 'Building management with limited permissions - can view, create, edit buildings, floors, tenants; can delete documents, assets, vendors, users; limited analytics',
      permissions: [
        { entity: 'sites', view: false, create: false, edit: false, delete: false },
        { entity: 'buildings', view: true, create: true, edit: true, delete: false },
        { entity: 'floors', view: true, create: true, edit: true, delete: false },
        { entity: 'tenants', view: true, create: true, edit: true, delete: false },
        { entity: 'documents', view: true, create: true, edit: true, delete: true },
        { entity: 'assets', view: true, create: true, edit: true, delete: true },
        { entity: 'vendors', view: true, create: true, edit: true, delete: true },
        { entity: 'customers', view: false, create: false, edit: false, delete: false },
        { entity: 'users', view: true, create: true, edit: true, delete: true },
        { entity: 'analytics', view: true, create: true, edit: false, delete: false }
      ]
    },
    {
      name: 'Contractor',
      description: 'Contractor access with limited permissions - can view buildings, floors, assets; can create documents',
      permissions: [
        { entity: 'sites', view: false, create: false, edit: false, delete: false },
        { entity: 'buildings', view: true, create: false, edit: false, delete: false },
        { entity: 'floors', view: true, create: false, edit: false, delete: false },
        { entity: 'tenants', view: false, create: false, edit: false, delete: false },
        { entity: 'documents', view: true, create: true, edit: false, delete: false },
        { entity: 'assets', view: true, create: false, edit: false, delete: false },
        { entity: 'vendors', view: false, create: false, edit: false, delete: false },
        { entity: 'customers', view: false, create: false, edit: false, delete: false },
        { entity: 'users', view: false, create: false, edit: false, delete: false },
        { entity: 'analytics', view: false, create: false, edit: false, delete: false }
      ]
    },
    {
      name: 'Tenants',
      description: 'Building tenants with view-only access to their resources',
      permissions: [
        { entity: 'sites', view: true, create: false, edit: false, delete: false },
        { entity: 'buildings', view: true, create: false, edit: false, delete: false },
        { entity: 'floors', view: true, create: false, edit: false, delete: false },
        { entity: 'tenants', view: false, create: false, edit: false, delete: false },
        { entity: 'documents', view: true, create: false, edit: false, delete: false },
        { entity: 'assets', view: true, create: false, edit: false, delete: false },
        { entity: 'vendors', view: false, create: false, edit: false, delete: false },
        { entity: 'customers', view: false, create: false, edit: false, delete: false },
        { entity: 'users', view: false, create: false, edit: false, delete: false },
        { entity: 'analytics', view: true, create: false, edit: false, delete: false }
      ]
    }
  ];
};

// Static method to initialize predefined roles
RoleSchema.statics.initializePredefinedRoles = async function() {
  const predefinedRoles = this.getPredefinedRoles();
  
  for (const roleData of predefinedRoles) {
    const existingRole = await this.findOne({ name: roleData.name });
    if (!existingRole) {
      const role = new this(roleData);
      await role.save();
      console.log(`Created predefined role: ${roleData.name}`);
    }
  }
};

// Add created_by field for tracking who created the role
RoleSchema.add({
  created_by: {
    type: String,
    trim: true
  }
});

// Roles are global and not tenant-scoped (tenant_id not needed)

module.exports = mongoose.model('Role', RoleSchema);
