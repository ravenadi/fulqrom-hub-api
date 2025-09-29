// Search and performance optimization helpers

/**
 * Build comprehensive search query for documents
 * @param {string} search - Search term
 * @param {Array} additionalFields - Additional fields to search
 * @returns {Object} MongoDB query object
 */
function buildSearchQuery(search, additionalFields = []) {
  if (!search || search.trim() === '') {
    return {};
  }

  const searchTerm = search.trim();
  const baseFields = [
    { name: { $regex: searchTerm, $options: 'i' } },
    { description: { $regex: searchTerm, $options: 'i' } },
    { 'tags.tags': { $regex: searchTerm, $options: 'i' } },
    { 'customer.customer_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.site.site_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.building.building_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.floor.floor_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.tenant.tenant_name': { $regex: searchTerm, $options: 'i' } },
    { 'file.file_meta.file_name': { $regex: searchTerm, $options: 'i' } },
    { 'metadata.certification_number': { $regex: searchTerm, $options: 'i' } },
    { 'metadata.compliance_framework': { $regex: searchTerm, $options: 'i' } },
    { created_by: { $regex: searchTerm, $options: 'i' } }
  ];

  // Add additional fields if provided
  const searchFields = [...baseFields, ...additionalFields];

  return { $or: searchFields };
}

/**
 * Build pagination object
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} Pagination configuration
 */
function buildPagination(page = 1, limit = 50) {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
  const skip = (pageNum - 1) * limitNum;

  return { pageNum, limitNum, skip };
}

/**
 * Build sort object
 * @param {string} sort - Sort field
 * @param {string} order - Sort order (asc/desc)
 * @returns {Object} MongoDB sort object
 */
function buildSort(sort = 'created_at', order = 'desc') {
  const allowedSortFields = ['name', 'category', 'type', 'created_at', 'updated_at'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
  const sortOrder = order === 'asc' ? 1 : -1;

  return { [sortField]: sortOrder };
}

/**
 * Validate MongoDB ObjectId format
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId
 */
function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Build standard API response
 * @param {boolean} success - Success status
 * @param {Object} data - Response data
 * @param {string} message - Response message
 * @param {Object} pagination - Pagination info
 * @returns {Object} Standardized response
 */
function buildApiResponse(success, data, message = null, pagination = null) {
  const response = { success };

  if (message) response.message = message;
  if (data) response.data = data;
  if (pagination) {
    response.count = data ? (Array.isArray(data) ? data.length : 1) : 0;
    response.total = pagination.total;
    response.page = pagination.page;
    response.pages = Math.ceil(pagination.total / pagination.limit);
  }

  return response;
}

/**
 * Handle errors with proper logging and response
 * @param {Error} error - Error object
 * @param {Object} res - Express response object
 * @param {string} operation - Operation being performed
 */
function handleError(error, res, operation = 'operation') {
  console.error(`Error in ${operation}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  const statusCode = error.statusCode || 500;
  const message = `Error ${operation.replace(/([A-Z])/g, ' $1').toLowerCase()}`;

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
}

/**
 * Cache key generator for documents
 * @param {string} operation - Operation name
 * @param {Object} params - Parameters
 * @returns {string} Cache key
 */
function generateCacheKey(operation, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((result, key) => {
      result[key] = params[key];
      return result;
    }, {});

  return `documents:${operation}:${JSON.stringify(sortedParams)}`;
}

/**
 * Sanitize query parameters
 * @param {Object} query - Query parameters
 * @returns {Object} Sanitized query
 */
function sanitizeQuery(query) {
  const sanitized = {};

  // Remove undefined and null values
  Object.keys(query).forEach(key => {
    if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
      sanitized[key] = query[key];
    }
  });

  return sanitized;
}

module.exports = {
  buildSearchQuery,
  buildPagination,
  buildSort,
  isValidObjectId,
  buildApiResponse,
  handleError,
  generateCacheKey,
  sanitizeQuery
};