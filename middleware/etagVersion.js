/**
 * ETag Version Middleware
 * 
 * Automatically attaches ETag headers based on Mongoose __v (version) field
 * for responses containing a single resource in data.
 * 
 * ETags follow the W/"v{version}" format (weak validator).
 * Clients should send this back as If-Match on PUT/PATCH/DELETE.
 */

/**
 * Attach ETag to responses based on __v field
 * 
 * Wraps res.json to inspect the response body and set ETag header
 * if the response contains a data object with __v field.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function attachETag(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(body) {
    // Check if response has data with version field
    if (body && body.data && body.data.__v !== undefined) {
      const version = body.data.__v;
      res.set('ETag', `W/"v${version}"`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📌 ETag set: W/"v${version}" for ${req.method} ${req.path}`);
      }
    }

    return originalJson(body);
  };

  next();
}

/**
 * Parse ETag from If-Match header
 * 
 * Extracts version number from If-Match header in format W/"v{version}"
 * and attaches it to req.clientVersion for use in update operations.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function parseIfMatch(req, res, next) {
  const ifMatch = req.get('If-Match');
  
  if (ifMatch) {
    // Parse W/"v123" format
    const match = ifMatch.match(/^W\/"v(\d+)"$/);
    if (match) {
      req.clientVersion = parseInt(match[1], 10);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📌 If-Match parsed: version ${req.clientVersion} for ${req.method} ${req.path}`);
      }
    } else {
      // Invalid ETag format
      return res.status(400).json({
        success: false,
        message: 'Invalid If-Match header format. Expected W/"v{version}"',
        code: 'INVALID_ETAG_FORMAT'
      });
    }
  }

  next();
}

/**
 * Require If-Match header for mutation operations
 * 
 * Enforces that PUT/PATCH/DELETE requests include either:
 * - If-Match header with ETag
 * - __v field in request body
 * 
 * Use this middleware on routes that require optimistic concurrency control.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function requireIfMatch(req, res, next) {
  // Only check for mutation operations
  if (!['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  // Check for version in If-Match header or request body
  const hasIfMatch = req.clientVersion !== undefined;
  const hasBodyVersion = req.body && req.body.__v !== undefined;

  if (!hasIfMatch && !hasBodyVersion) {
    return res.status(428).json({
      success: false,
      message: 'Precondition required. Include If-Match header or __v in request body for concurrent write safety.',
      code: 'PRECONDITION_REQUIRED',
      details: {
        expected: 'If-Match: W/"v{version}" header or __v field in body',
        documentation: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match'
      }
    });
  }

  // Prefer If-Match over body version
  if (!hasIfMatch && hasBodyVersion) {
    req.clientVersion = parseInt(req.body.__v, 10);
  }

  next();
}

/**
 * Handle version conflict response
 * 
 * Helper function to send consistent 409 Conflict responses
 * when optimistic concurrency check fails.
 * 
 * @param {Object} res - Express response
 * @param {Object} options - Conflict details
 * @param {number} options.clientVersion - Version sent by client
 * @param {number} options.currentVersion - Current version in database
 * @param {string} options.resource - Resource type (e.g., 'Vendor')
 * @param {string} options.id - Resource ID
 */
function sendVersionConflict(res, { clientVersion, currentVersion, resource, id }) {
  return res.status(409).json({
    success: false,
    message: 'Version conflict. The resource was modified by another user. Please refresh and try again.',
    code: 'VERSION_CONFLICT',
    details: {
      resource,
      id,
      clientVersion,
      currentVersion,
      advice: 'Fetch the latest version, merge your changes, and retry with the new version.'
    }
  });
}

module.exports = {
  attachETag,
  parseIfMatch,
  requireIfMatch,
  sendVersionConflict
};

