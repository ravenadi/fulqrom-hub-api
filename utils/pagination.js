/**
 * Standardized Pagination Utility
 * Provides consistent pagination response formatting across all controllers.
 *
 * @module utils/pagination
 */

/**
 * Build standardized pagination metadata
 * @param {Object} options - Pagination options
 * @param {number} options.page - Current page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @param {number} options.total - Total number of items
 * @param {Object} [options.req] - Express request object for building links
 * @returns {Object} Pagination metadata object
 */
function buildPaginationMeta({ page, limit, total, req = null }) {
  const currentPage = parseInt(page) || 1;
  const perPage = parseInt(limit) || 10;
  const totalItems = parseInt(total) || 0;
  const totalPages = Math.ceil(totalItems / perPage);
  const skip = (currentPage - 1) * perPage;

  const meta = {
    current_page: currentPage,
    per_page: perPage,
    total: totalItems,
    total_pages: totalPages,
    last_page: totalPages,
    from: totalItems > 0 ? skip + 1 : 0,
    to: Math.min(skip + perPage, totalItems),
    has_next_page: currentPage < totalPages,
    has_prev_page: currentPage > 1
  };

  return meta;
}

/**
 * Build pagination links for HATEOAS compliance
 * @param {Object} options - Link options
 * @param {Object} options.req - Express request object
 * @param {number} options.page - Current page
 * @param {number} options.limit - Items per page
 * @param {number} options.totalPages - Total number of pages
 * @returns {Object} Links object with first, last, prev, next URLs
 */
function buildPaginationLinks({ req, page, limit, totalPages }) {
  if (!req) return null;

  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  const currentPage = parseInt(page) || 1;
  const perPage = parseInt(limit) || 10;
  const pages = parseInt(totalPages) || 1;

  return {
    first: `${baseUrl}?page=1&per_page=${perPage}`,
    last: `${baseUrl}?page=${pages}&per_page=${perPage}`,
    prev: currentPage > 1 ? `${baseUrl}?page=${currentPage - 1}&per_page=${perPage}` : null,
    next: currentPage < pages ? `${baseUrl}?page=${currentPage + 1}&per_page=${perPage}` : null
  };
}

/**
 * Build complete pagination response object
 * @param {Object} options - Response options
 * @param {Array} options.data - Data array
 * @param {number} options.page - Current page number
 * @param {number} options.limit - Items per page
 * @param {number} options.total - Total number of items
 * @param {Object} [options.req] - Express request object for building links
 * @param {boolean} [options.includeLinks=true] - Whether to include HATEOAS links
 * @returns {Object} Complete pagination response
 */
function buildPaginatedResponse({ data, page, limit, total, req = null, includeLinks = true }) {
  const meta = buildPaginationMeta({ page, limit, total, req });

  const response = {
    success: true,
    data,
    meta
  };

  if (includeLinks && req) {
    response.links = buildPaginationLinks({
      req,
      page,
      limit,
      totalPages: meta.total_pages
    });
  }

  return response;
}

/**
 * Parse pagination query parameters with defaults
 * @param {Object} query - Express req.query object
 * @param {Object} [defaults] - Default values
 * @param {number} [defaults.page=1] - Default page
 * @param {number} [defaults.limit=10] - Default limit
 * @param {number} [defaults.maxLimit=100] - Maximum allowed limit
 * @returns {Object} Parsed pagination parameters
 */
function parsePaginationParams(query, defaults = {}) {
  const {
    page = defaults.page || 1,
    limit = defaults.limit || 10,
    per_page = limit
  } = query;

  const maxLimit = defaults.maxLimit || 100;

  const parsedPage = Math.max(1, parseInt(page) || 1);
  const parsedLimit = Math.min(maxLimit, Math.max(1, parseInt(per_page) || 10));
  const skip = (parsedPage - 1) * parsedLimit;

  return {
    page: parsedPage,
    limit: parsedLimit,
    skip
  };
}

/**
 * Calculate skip value for MongoDB queries
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {number} Skip value for query
 */
function calculateSkip(page, limit) {
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 10;
  return (p - 1) * l;
}

module.exports = {
  buildPaginationMeta,
  buildPaginationLinks,
  buildPaginatedResponse,
  parsePaginationParams,
  calculateSkip
};
