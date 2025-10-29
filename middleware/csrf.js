/**
 * CSRF Protection Middleware
 * 
 * Implements Double Submit Cookie pattern for CSRF protection.
 * Requires matching csrf token in cookie and x-csrf-token header
 * for all state-changing requests (POST, PUT, PATCH, DELETE).
 * 
 * The csrf cookie is set by the auth system on login.
 */

const crypto = require('crypto');

/**
 * CSRF validation middleware
 * 
 * Validates that the x-csrf-token header matches the csrf cookie
 * for non-GET requests. Blocks the request if mismatch detected.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function validateCSRF(req, res, next) {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Get CSRF token from header and cookie
  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies?.csrf;

  // Check if both tokens exist
  if (!headerToken || !cookieToken) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ CSRF check failed: ${req.method} ${req.path}`, {
        hasHeader: !!headerToken,
        hasCookie: !!cookieToken
      });
    }

    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed. Missing CSRF token.',
      code: 'CSRF_TOKEN_MISSING',
      details: {
        expected: 'x-csrf-token header must match csrf cookie'
      }
    });
  }

  // Compare tokens (constant-time comparison to prevent timing attacks)
  if (!constantTimeCompare(headerToken, cookieToken)) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ CSRF check failed: ${req.method} ${req.path} - Token mismatch`);
    }

    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed. Invalid CSRF token.',
      code: 'CSRF_TOKEN_INVALID'
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ CSRF check passed: ${req.method} ${req.path}`);
  }

  next();
}

/**
 * Generate a new CSRF token
 * 
 * Creates a cryptographically random token for CSRF protection.
 * This should be called during login/session creation.
 * 
 * @returns {string} Random CSRF token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Constant-time string comparison
 * 
 * Prevents timing attacks by ensuring comparison takes constant time
 * regardless of where strings differ.
 * 
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings match
 */
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Optional CSRF middleware
 * 
 * Like validateCSRF but doesn't fail if tokens are missing.
 * Useful during transition period when migrating from Bearer tokens.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function optionalCSRF(req, res, next) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies?.csrf;

  // If both present, validate them
  if (headerToken && cookieToken) {
    if (!constantTimeCompare(headerToken, cookieToken)) {
      return res.status(403).json({
        success: false,
        message: 'CSRF validation failed.',
        code: 'CSRF_TOKEN_INVALID'
      });
    }
  }

  // If missing, allow (for backward compatibility during migration)
  next();
}

module.exports = {
  validateCSRF,
  optionalCSRF,
  generateCSRFToken
};

