const Joi = require('joi');

/**
 * Asset validation schemas
 * Note: Criticality level values are loaded from /api/dropdowns, not hardcoded
 */

// Helper function for date validation
const dateSchema = Joi.date().iso().allow(null).optional();

// Helper function for positive number with 2 decimal places
const currencySchema = Joi.number().min(0).precision(2).allow(null).optional();

// Create Asset Schema
const createAssetSchema = Joi.object({
  // Required fields
  customer_id: Joi.string().required().messages({
    'string.empty': 'customer_id is required',
    'any.required': 'customer_id is required'
  }),

  // Optional reference fields
  site_id: Joi.string().allow(null).optional(),
  building_id: Joi.string().allow(null).optional(),
  floor_id: Joi.string().allow(null).optional(),

  // Primary Information
  asset_id: Joi.string().trim().allow('', null).optional(),
  asset_no: Joi.string().trim().allow('', null).optional(),
  device_id: Joi.string().trim().allow('', null).optional(),

  // Classification & Status
  status: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().allow('', null).optional(),
  type: Joi.string().trim().allow('', null).optional(),
  condition: Joi.string().trim().allow('', null).optional(),
  criticality_level: Joi.string().trim().allow('', null).optional(),

  // Details
  make: Joi.string().trim().max(255).allow('', null).optional(),
  model: Joi.string().trim().max(255).allow('', null).optional(),
  serial: Joi.string().trim().max(255).allow('', null).optional(),

  // HVAC/Refrigerant Information
  refrigerant: Joi.string().trim().allow('', null).optional(),
  refrigerant_capacity: Joi.string().trim().allow('', null).optional(),
  refrigerant_consumption: Joi.string().trim().allow('', null).optional(),

  // Location Information
  level: Joi.string().trim().allow('', null).optional(),
  area: Joi.string().trim().allow('', null).optional(),

  // Ownership & Service
  owner: Joi.string().trim().allow('', null).optional(),
  da19_life_expectancy: Joi.string().trim().allow('', null).optional(),
  service_status: Joi.string().trim().allow('', null).optional(),

  // Dates & Testing
  date_of_installation: dateSchema,
  age: Joi.string().trim().allow('', null).optional(),
  last_test_date: dateSchema,
  last_test_result: Joi.string().trim().allow('', null).optional(),

  // Financial Information (primary field names)
  purchase_cost_aud: currencySchema,
  current_book_value_aud: currencySchema,
  weight_kgs: Joi.number().min(0).allow(null).optional(),

  // Legacy field names (for backward compatibility)
  acquisition_cost: currencySchema,
  current_value: currencySchema,
  purchase_cost: currencySchema,
  current_book_value: currencySchema,
  weight: Joi.number().min(0).allow(null).optional(),
  installation_date: dateSchema,

  // System fields
  is_active: Joi.boolean().optional()
}).options({
  stripUnknown: false, // Keep unknown fields for flexibility
  abortEarly: false
});

// Update Asset Schema (all fields optional except when modifying references)
const updateAssetSchema = Joi.object({
  // Optional reference fields
  customer_id: Joi.string().allow(null).optional(),
  site_id: Joi.string().allow(null).optional(),
  building_id: Joi.string().allow(null).optional(),
  floor_id: Joi.string().allow(null).optional(),

  // Primary Information
  asset_id: Joi.string().trim().allow('', null).optional(),
  asset_no: Joi.string().trim().allow('', null).optional(),
  device_id: Joi.string().trim().allow('', null).optional(),

  // Classification & Status
  status: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().allow('', null).optional(),
  type: Joi.string().trim().allow('', null).optional(),
  condition: Joi.string().trim().allow('', null).optional(),
  criticality_level: Joi.string().trim().allow('', null).optional(),

  // Details
  make: Joi.string().trim().max(255).allow('', null).optional(),
  model: Joi.string().trim().max(255).allow('', null).optional(),
  serial: Joi.string().trim().max(255).allow('', null).optional(),

  // HVAC/Refrigerant Information
  refrigerant: Joi.string().trim().allow('', null).optional(),
  refrigerant_capacity: Joi.string().trim().allow('', null).optional(),
  refrigerant_consumption: Joi.string().trim().allow('', null).optional(),

  // Location Information
  level: Joi.string().trim().allow('', null).optional(),
  area: Joi.string().trim().allow('', null).optional(),

  // Ownership & Service
  owner: Joi.string().trim().allow('', null).optional(),
  da19_life_expectancy: Joi.string().trim().allow('', null).optional(),
  service_status: Joi.string().trim().allow('', null).optional(),

  // Dates & Testing
  date_of_installation: dateSchema,
  age: Joi.string().trim().allow('', null).optional(),
  last_test_date: dateSchema,
  last_test_result: Joi.string().trim().allow('', null).optional(),

  // Financial Information (primary field names)
  purchase_cost_aud: currencySchema,
  current_book_value_aud: currencySchema,
  weight_kgs: Joi.number().min(0).allow(null).optional(),

  // Legacy field names (for backward compatibility)
  acquisition_cost: currencySchema,
  current_value: currencySchema,
  purchase_cost: currencySchema,
  current_book_value: currencySchema,
  weight: Joi.number().min(0).allow(null).optional(),
  installation_date: dateSchema,

  // System fields
  is_active: Joi.boolean().optional()
}).options({
  stripUnknown: false, // Keep unknown fields for flexibility
  abortEarly: false
});

// Validation middleware
const validateCreateAsset = (req, res, next) => {
  const { error, value } = createAssetSchema.validate(req.body);

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/"/g, ''),
      value: detail.context.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  req.body = value;
  next();
};

const validateUpdateAsset = (req, res, next) => {
  const { error, value } = updateAssetSchema.validate(req.body);

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/"/g, ''),
      value: detail.context.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  req.body = value;
  next();
};

module.exports = {
  createAssetSchema,
  updateAssetSchema,
  validateCreateAsset,
  validateUpdateAsset
};
