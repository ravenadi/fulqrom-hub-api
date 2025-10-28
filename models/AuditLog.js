const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Audit Log schema - Simplified to track: action, description, module, module_id, user, ip, agent
const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'read', 'update', 'delete', 'auth'
    ],
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  module: {
    type: String,
    required: true,
    enum: [
      'auth', 'customer', 'site', 'building', 'floor', 
      'asset', 'tenant', 'building_tenant', 'document', 'user', 'vendor'
    ],
    trim: true,
    index: true
  },
  module_id: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  user: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    }
  },
  ip: {
    type: String,
    trim: true
  },
  agent: {
    type: String,
    trim: true
  },
  detail: {
    type: mongoose.Schema.Types.Mixed
  },
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
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
AuditLogSchema.index({ 'user.id': 1, created_at: -1 });
AuditLogSchema.index({ module: 1, action: 1 });
AuditLogSchema.index({ 'module_id': 1 });
AuditLogSchema.index({ tenant_id: 1, created_at: -1 });
AuditLogSchema.index({ created_at: -1 });

// Note: tenant_id is now explicitly defined in schema instead of using plugin

module.exports = mongoose.model('AuditLog', AuditLogSchema);

