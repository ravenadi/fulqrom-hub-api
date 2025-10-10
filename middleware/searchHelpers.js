// Search and performance optimization helpers

/**
 * Escape special regex characters in search term
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  // Trim and escape regex special characters
  const searchTerm = escapeRegex(search.trim());
  const baseFields = [
    // Basic document fields
    { name: { $regex: searchTerm, $options: 'i' } },
    { description: { $regex: searchTerm, $options: 'i' } },
    { category: { $regex: searchTerm, $options: 'i' } },
    { type: { $regex: searchTerm, $options: 'i' } },
    { status: { $regex: searchTerm, $options: 'i' } },
    { engineering_discipline: { $regex: searchTerm, $options: 'i' } },
    { version: { $regex: searchTerm, $options: 'i' } },
    { version_number: { $regex: searchTerm, $options: 'i' } },

    // Tags
    { 'tags.tags': { $regex: searchTerm, $options: 'i' } },

    // Customer and location hierarchy
    { 'customer.customer_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.site.site_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.building.building_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.floor.floor_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.tenant.tenant_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.vendor.vendor_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.asset.asset_name': { $regex: searchTerm, $options: 'i' } },
    { 'location.asset.asset_type': { $regex: searchTerm, $options: 'i' } },

    // File information
    { 'file.file_meta.file_name': { $regex: searchTerm, $options: 'i' } },
    { 'file.file_meta.file_type': { $regex: searchTerm, $options: 'i' } },
    { 'file.file_meta.file_extension': { $regex: searchTerm, $options: 'i' } },

    // Compliance and regulatory metadata
    { 'metadata.certification_number': { $regex: searchTerm, $options: 'i' } },
    { 'metadata.compliance_framework': { $regex: searchTerm, $options: 'i' } },
    { 'metadata.regulatory_framework': { $regex: searchTerm, $options: 'i' } },
    { 'metadata.compliance_status': { $regex: searchTerm, $options: 'i' } },

    // Drawing information
    { 'drawing_info.drawing_status': { $regex: searchTerm, $options: 'i' } },
    { 'drawing_info.prepared_by': { $regex: searchTerm, $options: 'i' } },
    { 'drawing_info.approved_by_user': { $regex: searchTerm, $options: 'i' } },
    { 'drawing_info.drawing_scale': { $regex: searchTerm, $options: 'i' } },

    // Approval workflow
    { approval_status: { $regex: searchTerm, $options: 'i' } },
    { approved_by: { $regex: searchTerm, $options: 'i' } },

    // Access control
    { 'access_control.access_level': { $regex: searchTerm, $options: 'i' } },
    { 'access_control.access_users': { $regex: searchTerm, $options: 'i' } },

    // Audit fields
    { created_by: { $regex: searchTerm, $options: 'i' } },

    // Version metadata
    { 'version_metadata.uploaded_by.user_name': { $regex: searchTerm, $options: 'i' } },
    { 'version_metadata.uploaded_by.email': { $regex: searchTerm, $options: 'i' } },
    { 'version_metadata.change_notes': { $regex: searchTerm, $options: 'i' } }
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
  const allowedSortFields = [
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
    'location.floor.floor_number',
    'location.asset.asset_name',
    'file.file_meta.file_name',
    'file.file_meta.file_size',
    'metadata.issue_date',
    'metadata.expiry_date',
    'metadata.review_date',
    'drawing_info.date_issued',
    'drawing_info.drawing_status',
    'is_current_version'
  ];
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
  escapeRegex,
  buildSearchQuery,
  buildPagination,
  buildSort,
  isValidObjectId,
  buildApiResponse,
  handleError,
  generateCacheKey,
  sanitizeQuery
};