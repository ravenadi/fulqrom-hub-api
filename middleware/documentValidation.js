const Joi = require('joi');
const JoiObjectId = require('joi-objectid')(Joi);

// Document creation validation schema
const createDocumentSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(255),
  description: Joi.string().optional().trim().max(1000),
  version: Joi.string().optional().trim().default('1.0'),

  // Category - loaded from GET /api/dropdowns (document_document_categories)
  category: Joi.string().required().trim(),

  // Type - loaded from GET /api/dropdowns (document_document_types)
  type: Joi.string().required().trim(),

  // Status - loaded from GET /api/dropdowns (document_document_statuses)
  status: Joi.string().optional().trim().default('Draft'),

  // Engineering discipline - loaded from GET /api/dropdowns (document_document_engineering_disciplines)
  engineering_discipline: Joi.string().optional().trim(),

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
  asset_id: Joi.string().optional(),
  asset_name: Joi.string().optional(),
  asset_type: Joi.string().optional(),
  tenant_id: Joi.string().optional(),
  tenant_name: Joi.string().optional(),

  // Tags
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim()),
    Joi.string().trim()
  ).optional(),

  // Compliance fields - validation removed, loaded from dropdowns
  regulatory_framework: Joi.string().optional().trim(),
  certification_number: Joi.string().optional().trim(),
  compliance_framework: Joi.string().optional().trim(),
  compliance_status: Joi.string().optional().trim(),
  issue_date: Joi.string().optional().isoDate(),
  expiry_date: Joi.string().optional().isoDate(),
  review_date: Joi.string().optional().isoDate(),
  frequency: Joi.string().optional().trim().valid('weekly', 'monthly', 'quarterly', 'annual'),

  // Approval fields - loaded from GET /api/dropdowns (document_document_approval_statuses)
  approval_required: Joi.boolean().optional(),
  approved_by: Joi.string().optional().trim(),
  approval_status: Joi.string().optional().trim(),

  // Approval configuration
  approval_config: Joi.object({
    enabled: Joi.boolean().optional(),
    status: Joi.string().optional().trim(),
    approvers: Joi.array().items(
      Joi.object({
        user_id: Joi.string().optional(),
        user_name: Joi.string().optional().trim().allow(''),
        user_email: Joi.string().email().required()
      })
    ).optional(),
    approval_history: Joi.array().optional()
  }).optional(),

  // Access control
  access_level: Joi.string().optional().trim(),
  access_users: Joi.array().items(Joi.string()).optional(),

  // Drawing info
  date_issued: Joi.string().optional().isoDate(),
  drawing_status: Joi.string().optional().trim(),
  prepared_by: Joi.string().optional().trim(),
  drawing_scale: Joi.string().optional().trim(),
  approved_by_user: Joi.string().optional().trim(),
  related_drawings: Joi.array().items(Joi.string()).optional(),

  // Vendor association
  vendor_id: Joi.string().optional(),
  vendor_name: Joi.string().optional(),

  // Audit fields
  created_by: Joi.string().optional().trim()
});

// Document update validation schema
const updateDocumentSchema = Joi.object({
  name: Joi.string().optional().trim().min(1).max(255),
  description: Joi.string().optional().trim().max(1000),
  version: Joi.string().optional().trim(),

  // Category - loaded from GET /api/dropdowns
  category: Joi.string().optional().trim(),

  // Type - loaded from GET /api/dropdowns
  type: Joi.string().optional().trim(),

  // Status - loaded from GET /api/dropdowns
  status: Joi.string().optional().trim(),

  // Engineering discipline - loaded from GET /api/dropdowns
  engineering_discipline: Joi.string().optional().trim(),

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

  // Compliance metadata - validation removed, loaded from dropdowns
  metadata: Joi.object({
    engineering_discipline: Joi.string().optional().trim().allow('', null),
    regulatory_framework: Joi.string().optional().trim().allow('', null),
    certification_number: Joi.string().optional().trim().allow(''),
    compliance_framework: Joi.string().optional().trim().allow(''),
    compliance_status: Joi.string().optional().trim().allow('', null),
    issue_date: Joi.string().optional().isoDate().allow(''),
    expiry_date: Joi.string().optional().isoDate().allow(''),
    review_date: Joi.string().optional().isoDate().allow(''),
    frequency: Joi.string().optional().trim().valid('weekly', 'monthly', 'quarterly', 'annual').allow('', null)
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
  asset_id: Joi.string().optional(),
  tenant_id: Joi.string().optional(),
  vendor_id: Joi.string().optional(),
  // All dropdown values loaded from GET /api/dropdowns
  category: Joi.string().optional().trim(),
  type: Joi.string().optional().trim(),
  engineering_discipline: Joi.string().optional().trim(),
  regulatory_framework: Joi.string().optional().trim(),
  compliance_status: Joi.string().optional().trim(),
  status: Joi.string().optional().trim(),
  drawing_status: Joi.string().optional().trim(),
  prepared_by: Joi.string().optional().trim(),
  approved_by_user: Joi.string().optional().trim(),
  access_level: Joi.string().optional().trim(),
  tag: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional(),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional(),
  search: Joi.string().optional().trim().min(1),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sort: Joi.string().optional().valid(
    'name',
    'category',
    'type',
    'status',
    'approval_status',
    'engineering_discipline',
    'version',
    'version_number',
    'version_sequence',
    'created_at',
    'updated_at',
    'customer.customer_name',
    'location.site.site_name',
    'location.building.building_name',
    'location.floor.floor_name',
    'location.asset.asset_name',
    'file.file_meta.file_name',
    'file.file_meta.file_size',
    'metadata.issue_date',
    'metadata.expiry_date',
    'metadata.review_date',
    'drawing_info.date_issued',
    'drawing_info.drawing_status',
    'is_current_version'
  ).default('created_at'),
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