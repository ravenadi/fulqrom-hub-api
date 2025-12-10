const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

/**
 * ThingsBoard Telemetry Schema
 * Stores telemetry data from ThingsBoard IoT devices
 * Time-series data optimized for queries by device and time range
 */
const TbTelemetrySchema = new mongoose.Schema({
  // Reference to TbDevice
  tb_device_id: {
    type: String,
    required: true,
    index: true
  },

  // Telemetry key (e.g., 'temperature', 'humidity', 'power')
  key: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Telemetry value - can be number, string, boolean, or object
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Timestamp from ThingsBoard
  ts: {
    type: Date,
    required: true,
    index: true
  },

  // Data type for proper parsing
  data_type: {
    type: String,
    enum: ['number', 'string', 'boolean', 'json'],
    default: 'number'
  },

  // Import metadata
  imported_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'tb_telemetry'
});

// Compound indexes for efficient time-series queries
TbTelemetrySchema.index({ tb_device_id: 1, key: 1, ts: -1 });
TbTelemetrySchema.index({ tb_device_id: 1, ts: -1 });
TbTelemetrySchema.index({ tenant_id: 1, tb_device_id: 1, key: 1 });

// TTL index for auto-cleanup (optional - 90 days retention)
// Uncomment to enable: TbTelemetrySchema.index({ ts: 1 }, { expireAfterSeconds: 7776000 });

// Apply tenant plugin for multi-tenancy
TbTelemetrySchema.plugin(tenantPlugin);

module.exports = mongoose.model('TbTelemetry', TbTelemetrySchema);
