/**
 * Standardized Error Response Helpers
 * Provides consistent error response formatting across all controllers and routes.
 *
 * @module utils/errorResponses
 */

/**
 * HTTP Status codes for common errors
 */
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Send a bad request (400) error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} [details] - Additional error details
 */
function badRequest(res, message, details = null) {
  const response = { success: false, message };
  if (details) response.details = details;
  return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
}

/**
 * Send an unauthorized (401) error response
 * @param {Object} res - Express response object
 * @param {string} [message='Unauthorized'] - Error message
 */
function unauthorized(res, message = 'Unauthorized') {
  return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message });
}

/**
 * Send a forbidden (403) error response
 * @param {Object} res - Express response object
 * @param {string} [message='Access denied'] - Error message
 */
function forbidden(res, message = 'Access denied') {
  return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message });
}

/**
 * Send a not found (404) error response
 * @param {Object} res - Express response object
 * @param {string} [resource='Resource'] - Name of the resource that wasn't found
 */
function notFound(res, resource = 'Resource') {
  return res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `${resource} not found`
  });
}

/**
 * Send a conflict (409) error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message describing the conflict
 */
function conflict(res, message) {
  return res.status(HTTP_STATUS.CONFLICT).json({ success: false, message });
}

/**
 * Send a validation error (422) response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object|Array} [errors] - Validation errors details
 */
function validationError(res, message, errors = null) {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json(response);
}

/**
 * Send an internal server error (500) response
 * @param {Object} res - Express response object
 * @param {string} [message='Internal server error'] - Error message
 * @param {Error} [error] - Original error object (only included in non-production)
 */
function internalError(res, message = 'Internal server error', error = null) {
  const response = { success: false, message };

  // Only include error details in non-production environments
  if (error && process.env.NODE_ENV !== 'production') {
    response.error = error.message;
  }

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
}

/**
 * Send a service unavailable (503) response
 * @param {Object} res - Express response object
 * @param {string} [message='Service temporarily unavailable'] - Error message
 */
function serviceUnavailable(res, message = 'Service temporarily unavailable') {
  return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ success: false, message });
}

/**
 * Send a no tenant context (403) error response
 * @param {Object} res - Express response object
 */
function noTenantContext(res) {
  return res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    message: 'No tenant context found. User must be associated with a tenant.'
  });
}

/**
 * Send an invalid ID format (400) error response
 * @param {Object} res - Express response object
 * @param {string} [idType='ID'] - Type of ID that's invalid
 */
function invalidIdFormat(res, idType = 'ID') {
  return res.status(HTTP_STATUS.BAD_REQUEST).json({
    success: false,
    message: `Invalid ${idType} format`
  });
}

/**
 * Send a duplicate entry (409) error response
 * @param {Object} res - Express response object
 * @param {string} field - The field that has a duplicate value
 */
function duplicateEntry(res, field) {
  return res.status(HTTP_STATUS.CONFLICT).json({
    success: false,
    message: `${field} already exists`
  });
}

/**
 * Send a required field (400) error response
 * @param {Object} res - Express response object
 * @param {string} field - The required field name
 */
function requiredField(res, field) {
  return res.status(HTTP_STATUS.BAD_REQUEST).json({
    success: false,
    message: `${field} is required`
  });
}

/**
 * Handle common controller errors consistently
 * @param {Object} res - Express response object
 * @param {Error} error - The error object
 * @param {string} [context='operation'] - Description of the operation that failed
 */
function handleControllerError(res, error, context = 'operation') {
  console.error(`Error in ${context}:`, error);

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(e => e.message);
    return validationError(res, 'Validation failed', errors);
  }

  // Handle Mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return duplicateEntry(res, field);
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (error.name === 'CastError' && error.kind === 'ObjectId') {
    return invalidIdFormat(res);
  }

  // Default to internal server error
  return internalError(res, `Error during ${context}`, error);
}

module.exports = {
  HTTP_STATUS,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  internalError,
  serviceUnavailable,
  noTenantContext,
  invalidIdFormat,
  duplicateEntry,
  requiredField,
  handleControllerError
};
