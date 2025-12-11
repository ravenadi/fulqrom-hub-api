const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

/**
 * ThingsBoard Device Schema
 * Stores devices imported from ThingsBoard IoT platform
 * Kept separate from Assets to maintain clean separation of concerns
 */
const TbDeviceSchema = new mongoose.Schema({
  // ThingsBoard identifiers
  tb_device_id: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  tb_entity_type: {
    type: String,
    default: 'DEVICE',
    trim: true
  },

  // Device information from ThingsBoard
  name: {
    type: String,
    required: true,
    trim: true
  },
  label: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    trim: true
  },

  // ThingsBoard profile info
  device_profile_id: {
    type: String,
    trim: true
  },
  device_profile_name: {
    type: String,
    trim: true
  },

  // ThingsBoard customer info (their customer, not ours)
  tb_customer_id: {
    type: String,
    trim: true
  },
  tb_customer_title: {
    type: String,
    trim: true
  },

  // Device status
  is_active: {
    type: Boolean,
    default: true
  },
  is_gateway: {
    type: Boolean,
    default: false
  },

  // ThingsBoard timestamps
  tb_created_time: {
    type: Date
  },

  // Device attributes from ThingsBoard (server/shared/client)
  attributes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Latest telemetry snapshot (for quick access)
  latest_telemetry: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  telemetry_updated_at: {
    type: Date
  },

  // Additional info from ThingsBoard
  additional_info: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Variable mappings from CSV (key -> {full_name, label, unit})
  // Maps telemetry keys (e.g., "BV 67") to human-readable info
  variable_mappings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Import metadata
  import_metadata: {
    imported_at: {
      type: Date,
      default: Date.now
    },
    last_sync: {
      type: Date,
      default: Date.now
    },
    import_source: {
      type: String,
      default: 'thingsboard-api'
    }
  },

  // Optional link to Fulqrom asset (for future linking if needed)
  linked_asset_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset'
  },

  // Soft delete
  is_delete: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'tb_devices'
});

// Indexes for efficient queries
TbDeviceSchema.index({ tb_device_id: 1, tenant_id: 1 }, { unique: true });
TbDeviceSchema.index({ type: 1, tenant_id: 1 });
TbDeviceSchema.index({ name: 'text', label: 'text' });
TbDeviceSchema.index({ is_active: 1 });
TbDeviceSchema.index({ is_delete: 1 });

// Apply tenant plugin for multi-tenancy
TbDeviceSchema.plugin(tenantPlugin);

module.exports = mongoose.model('TbDevice', TbDeviceSchema);
