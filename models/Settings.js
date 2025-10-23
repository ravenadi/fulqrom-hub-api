const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// Settings Schema for storing application-wide configuration
// This includes dropdown values that can be managed from the Settings UI
const SettingsSchema = new mongoose.Schema({
  // Unique key for the setting (e.g., 'dropdowns', 'system_config', etc.)
  setting_key: {
    type: String,
    required: true,
    // unique: true,
    trim: true,
    index: true
  },

  // Setting category/module (e.g., 'customer', 'document', 'site', 'system')
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Setting type (e.g., 'dropdown', 'config', 'feature_flag')
  setting_type: {
    type: String,
    required: true,
    enum: ['dropdown', 'config', 'feature_flag', 'theme', 'other'],
    default: 'dropdown',
    trim: true
  },

  // Description of what this setting does
  description: {
    type: String,
    trim: true
  },

  // The actual setting value (flexible schema for different types)
  // For dropdowns, this will be an object with nested arrays
  // Example: { customer: { industry_types: [...], ... }, document: { ... } }
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Default value (for reset functionality)
  default_value: {
    type: mongoose.Schema.Types.Mixed
  },

  // Whether this setting is active/enabled
  is_active: {
    type: Boolean,
    default: true
  },

  // Whether this setting can be edited by users
  is_editable: {
    type: Boolean,
    default: true
  },

  // Audit fields
  created_by: {
    type: String,
    default: 'system',
    trim: true
  },
  updated_by: {
    type: String,
    default: 'system',
    trim: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false // We're managing timestamps manually
});

// Pre-save middleware to update timestamps
SettingsSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Index for quick lookups
SettingsSchema.index({ setting_key: 1, category: 1 });
SettingsSchema.index({ setting_type: 1, is_active: 1 });

// Static method to get or create a setting
SettingsSchema.statics.getOrCreate = async function(settingKey, defaultValue, options = {}) {
  let setting = await this.findOne({ setting_key: settingKey });

  if (!setting) {
    setting = await this.create({
      setting_key: settingKey,
      category: options.category || 'general',
      setting_type: options.setting_type || 'config',
      description: options.description || '',
      value: defaultValue,
      default_value: defaultValue,
      created_by: options.created_by || 'system',
      updated_by: options.updated_by || 'system'
    });
  }

  return setting;
};

// Static method to update a setting value
SettingsSchema.statics.updateValue = async function(settingKey, newValue, updatedBy = 'system') {
  const setting = await this.findOne({ setting_key: settingKey });

  if (!setting) {
    throw new Error(`Setting with key '${settingKey}' not found`);
  }

  setting.value = newValue;
  setting.updated_by = updatedBy;
  setting.updated_at = new Date();

  await setting.save();
  return setting;
};

// Static method to reset a setting to default
SettingsSchema.statics.resetToDefault = async function(settingKey, updatedBy = 'system') {
  const setting = await this.findOne({ setting_key: settingKey });

  if (!setting) {
    throw new Error(`Setting with key '${settingKey}' not found`);
  }

  if (!setting.default_value) {
    throw new Error(`Setting '${settingKey}' has no default value`);
  }

  setting.value = setting.default_value;
  setting.updated_by = updatedBy;
  setting.updated_at = new Date();

  await setting.save();
  return setting;
};

// Apply tenant plugin for multi-tenancy support
SettingsSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Settings', SettingsSchema);
