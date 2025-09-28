const Joi = require('joi');
const JoiObjectId = require('joi-objectid')(Joi);

// Document creation validation schema
const createDocumentSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(255),
  description: Joi.string().optional().trim().max(1000),
  version: Joi.string().optional().trim().default('1.0'),

  category: Joi.string().required().valid(
    'drawing_register',
    'compliance_regulatory',
    'standards_procedures',
    'building_management',
    'general_repository'
  ),

  type: Joi.string().required().valid(
    'compliance',
    'standards',
    'management',
    'general',
    'service_report'
  ),

  engineering_discipline: Joi.string().optional().valid(
    'Architectural',
    'Structural',
    'Electrical',
    'Mechanical'
  ),

  // Customer information (required)
  customer_id: Joi.string().required(),
  customer_name: Joi.string().optional(),

  // Location associations (optional)
  site_id: Joi.string().optional(),
  site_name: Joi.string().optional(),
  building_id: Joi.string().optional(),
  building_name: Joi.string().optional(),
  floor_id: Joi.string().optional(),
  floor_name: Joi.string().optional(),
  tenant_id: Joi.string().optional(),
  tenant_name: Joi.string().optional(),

  // Tags
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim()),
    Joi.string().trim()
  ).optional(),

  // Compliance fields (conditional on category)
  regulatory_framework: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().valid(
      'as1851_fire_systems',
      'as3745_emergency_control',
      'nabers_energy',
      'green_star',
      'whs_compliance',
      'essential_safety_measures'
    ),
    otherwise: Joi.forbidden()
  }),

  certification_number: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().trim(),
    otherwise: Joi.forbidden()
  }),

  compliance_framework: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().trim(),
    otherwise: Joi.forbidden()
  }),

  compliance_status: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().valid(
      'current',
      'expiring_30_days',
      'overdue',
      'under_review'
    ),
    otherwise: Joi.forbidden()
  }),

  issue_date: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().isoDate(),
    otherwise: Joi.forbidden()
  }),

  expiry_date: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().isoDate(),
    otherwise: Joi.forbidden()
  }),

  review_date: Joi.when('category', {
    is: 'compliance_regulatory',
    then: Joi.string().optional().isoDate(),
    otherwise: Joi.forbidden()
  }),

  // Audit fields
  created_by: Joi.string().optional().trim()
});

// Document update validation schema
const updateDocumentSchema = Joi.object({
  name: Joi.string().optional().trim().min(1).max(255),
  description: Joi.string().optional().trim().max(1000),
  version: Joi.string().optional().trim(),

  category: Joi.string().optional().valid(
    'drawing_register',
    'compliance_regulatory',
    'standards_procedures',
    'building_management',
    'general_repository'
  ),

  type: Joi.string().optional().valid(
    'compliance',
    'standards',
    'management',
    'general',
    'service_report'
  ),

  engineering_discipline: Joi.string().optional().valid(
    'Architectural',
    'Structural',
    'Electrical',
    'Mechanical'
  ),

  // Tags
  tags: Joi.object({
    tags: Joi.array().items(Joi.string().trim()).optional()
  }).optional(),

  // Customer information
  customer: Joi.object({
    customer_id: Joi.string().optional(),
    customer_name: Joi.string().optional()
  }).optional(),

  // Location information
  location: Joi.object({
    site: Joi.object({
      site_id: Joi.string().optional(),
      site_name: Joi.string().optional()
    }).optional(),
    building: Joi.object({
      building_id: Joi.string().optional(),
      building_name: Joi.string().optional()
    }).optional(),
    floor: Joi.object({
      floor_id: Joi.string().optional(),
      floor_name: Joi.string().optional()
    }).optional(),
    tenant: Joi.object({
      tenant_id: Joi.string().optional(),
      tenant_name: Joi.string().optional()
    }).optional()
  }).optional(),

  // Compliance metadata
  metadata: Joi.object({
    engineering_discipline: Joi.alternatives().try(
      Joi.string().valid('Architectural', 'Structural', 'Electrical', 'Mechanical'),
      Joi.string().valid('none', '').allow(null)
    ).optional(),
    regulatory_framework: Joi.alternatives().try(
      Joi.string().valid('as1851_fire_systems', 'as3745_emergency_control', 'nabers_energy', 'green_star', 'whs_compliance', 'essential_safety_measures'),
      Joi.string().valid('none', '').allow(null)
    ).optional(),
    certification_number: Joi.string().optional().trim().allow(''),
    compliance_framework: Joi.string().optional().trim().allow(''),
    compliance_status: Joi.alternatives().try(
      Joi.string().valid('current', 'expiring_30_days', 'overdue', 'under_review'),
      Joi.string().valid('none', '').allow(null)
    ).optional(),
    issue_date: Joi.string().optional().isoDate().allow(''),
    expiry_date: Joi.string().optional().isoDate().allow(''),
    review_date: Joi.string().optional().isoDate().allow('')
  }).optional(),

  // Audit fields
  created_by: Joi.string().optional().trim()
}).min(1); // At least one field must be provided for update

// Query parameters validation for GET requests
const queryParamsSchema = Joi.object({
  customer_id: Joi.string().optional(),
  site_id: Joi.string().optional(),
  building_id: Joi.string().optional(),
  floor_id: Joi.string().optional(),
  tenant_id: Joi.string().optional(),
  category: Joi.string().optional().valid(
    'drawing_register',
    'compliance_regulatory',
    'standards_procedures',
    'building_management',
    'general_repository'
  ),
  type: Joi.string().optional().valid(
    'compliance',
    'standards',
    'management',
    'general',
    'service_report'
  ),
  engineering_discipline: Joi.string().optional().valid(
    'Architectural',
    'Structural',
    'Electrical',
    'Mechanical'
  ),
  regulatory_framework: Joi.string().optional().valid(
    'as1851_fire_systems',
    'as3745_emergency_control',
    'nabers_energy',
    'green_star',
    'whs_compliance',
    'essential_safety_measures'
  ),
  compliance_status: Joi.string().optional().valid(
    'current',
    'expiring_30_days',
    'overdue',
    'under_review'
  ),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional(),
  search: Joi.string().optional().trim().min(1),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sort: Joi.string().optional().valid('name', 'category', 'type', 'created_at').default('created_at'),
  order: Joi.string().optional().valid('asc', 'desc').default('desc')
});

// Middleware function to validate document creation
const validateCreateDocument = (req, res, next) => {
  try {
    // Parse document data from multipart form
    let documentData;
    if (req.body.document_data) {
      try {
        documentData = typeof req.body.document_data === 'string'
          ? JSON.parse(req.body.document_data)
          : req.body.document_data;
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in document_data field',
          error: parseError.message
        });
      }
    } else {
      documentData = req.body;
    }

    // Validate the document data
    const { error, value } = createDocumentSchema.validate(documentData, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Add validated data back to request
    req.validatedData = value;
    next();

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Validation error',
      error: err.message
    });
  }
};

// Middleware function to validate document updates
const validateUpdateDocument = (req, res, next) => {
  const { error, value } = updateDocumentSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  req.validatedData = value;
  next();
};

// Middleware function to validate query parameters
const validateQueryParams = (req, res, next) => {
  const { error, value } = queryParamsSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Invalid query parameters',
      errors: validationErrors
    });
  }

  req.validatedQuery = value;
  next();
};

// Middleware to validate MongoDB ObjectId parameters
const validateObjectId = (req, res, next) => {
  const { id } = req.params;

  if (id && !id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid document ID format'
    });
  }

  next();
};

module.exports = {
  validateCreateDocument,
  validateUpdateDocument,
  validateQueryParams,
  validateObjectId,
  createDocumentSchema,
  updateDocumentSchema,
  queryParamsSchema
};