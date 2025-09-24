/**
 * Validation middleware for request validation using Joi schemas
 */

// Validation middleware factory
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    let dataToValidate;

    // Determine what to validate based on source
    switch (source) {
      case 'body':
        dataToValidate = req.body;
        break;
      case 'params':
        dataToValidate = req.params;
        break;
      case 'query':
        dataToValidate = req.query;
        break;
      case 'headers':
        dataToValidate = req.headers;
        break;
      default:
        dataToValidate = req.body;
    }

    // Perform validation
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Get all validation errors
      stripUnknown: true, // Remove unknown fields
      convert: true // Convert strings to numbers, etc.
    });

    if (error) {
      // Format validation errors
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
        details: {
          errorCount: validationErrors.length,
          source: source
        }
      });
    }

    // Replace the original data with validated and sanitized data
    switch (source) {
      case 'body':
        req.body = value;
        break;
      case 'params':
        req.params = value;
        break;
      case 'query':
        req.query = value;
        break;
      case 'headers':
        req.headers = value;
        break;
    }

    next();
  };
};

// Specific validation middlewares
const validateBody = (schema) => validate(schema, 'body');
const validateParams = (schema) => validate(schema, 'params');
const validateQuery = (schema) => validate(schema, 'query');
const validateHeaders = (schema) => validate(schema, 'headers');

// Async validation wrapper for database operations
const asyncValidate = (validationFn) => {
  return async (req, res, next) => {
    try {
      await validationFn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

// Custom validation for unique fields (e.g., ABN uniqueness)
const validateUniqueABN = (Customer) => {
  return async (req, res, next) => {
    try {
      const { abn } = req.body;
      const { id } = req.params;

      if (!abn) {
        return next(); // Let Joi handle required validation
      }

      // Build query to check for existing ABN
      const query = { abn };

      // If updating, exclude current customer from check
      if (id) {
        query._id = { $ne: id };
      }

      const existingCustomer = await Customer.findOne(query);

      if (existingCustomer) {
        return res.status(409).json({
          success: false,
          message: 'Validation failed',
          errors: [{
            field: 'abn',
            message: 'ABN already exists in the system',
            value: abn
          }],
          details: {
            errorType: 'DUPLICATE_ABN',
            existingId: existingCustomer._id
          }
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Response formatting middleware
const formatResponse = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to ensure consistent response format
  res.json = function(data) {
    // If data is already properly formatted, use as-is
    if (data && typeof data === 'object' && data.hasOwnProperty('success')) {
      return originalJson.call(this, data);
    }

    // Format single resource response
    if (data && !Array.isArray(data) && typeof data === 'object') {
      return originalJson.call(this, {
        success: true,
        data: data
      });
    }

    // Format array response
    if (Array.isArray(data)) {
      return originalJson.call(this, {
        success: true,
        count: data.length,
        data: data
      });
    }

    // Default formatting
    return originalJson.call(this, {
      success: true,
      data: data
    });
  };

  next();
};

// Pagination helper
const parsePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Add pagination info to request
  req.pagination = {
    page,
    limit,
    skip
  };

  next();
};

// Search helper
const parseSearch = (req, res, next) => {
  const { search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  // Build search query
  let searchQuery = {};

  if (search) {
    searchQuery = {
      $or: [
        { organisationName: { $regex: search, $options: 'i' } },
        { tradingName: { $regex: search, $options: 'i' } },
        { abn: { $regex: search, $options: 'i' } },
        { 'businessAddress.suburb': { $regex: search, $options: 'i' } }
      ]
    };
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  req.searchQuery = searchQuery;
  req.sortOptions = sort;

  next();
};

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
  validateHeaders,
  asyncValidate,
  validateUniqueABN,
  formatResponse,
  parsePagination,
  parseSearch
};