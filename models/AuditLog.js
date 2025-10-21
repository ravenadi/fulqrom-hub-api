const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Audit Log schema for tracking user actions
const AuditLogSchema = new mongoose.Schema({
  user_id: {
    type: String,
    trim: true
  },
  user_email: {
    type: String,
    trim: true
  },
  user_name: {
    type: String,
    trim: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'read', 'update', 'delete',
      'login', 'logout', 'deactivate', 'activate',
      'assign_role', 'remove_role',
      'grant_access', 'revoke_access'
    ],
    trim: true
  },
  resource_type: {
    type: String,
    required: true,
    enum: [
      'user', 'role', 'customer', 'site', 'building',
      'floor', 'asset', 'tenant', 'document', 'vendor'
    ],
    trim: true
  },
  resource_id: {
    type: String,
    trim: true
  },
  resource_name: {
    type: String,
    trim: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ip_address: {
    type: String,
    trim: true
  },
  user_agent: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'error'],
    default: 'success',
    trim: true
  },
  error_message: {
    type: String,
    trim: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

// Indexes for efficient querying
AuditLogSchema.index({ user_id: 1, created_at: -1 });
AuditLogSchema.index({ resource_type: 1, resource_id: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ created_at: -1 });
AuditLogSchema.index({ status: 1 });

// Apply tenant plugin for multi-tenancy support
AuditLogSchema.plugin(tenantPlugin);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
