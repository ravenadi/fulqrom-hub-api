/**
 * Authentication Middleware - Bearer Token Only
 *
 * Uses Auth0 JWT Bearer tokens for authentication.
 * Simple, stateless, proven approach.
 */

const { requireAuth } = require('./auth0');
const { isPublicRoute } = require('../config/middleware.config');

/**
 * Authentication middleware - Bearer tokens only
 * Validates Auth0 JWT from Authorization header
 */
const authenticate = (req, res, next) => {
  // Skip authentication for public endpoints
  if (isPublicRoute(req.path)) {
    // Reduce logging verbosity - only log if DEBUG_LOGS is enabled
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log(`✓ Bypassing auth for public endpoint: ${req.method} ${req.path}`);
    }
    return next();
  }

  // Reduce logging verbosity - only log if DEBUG_LOGS is enabled
  if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
    console.log(`🔒 Applying auth for protected endpoint: ${req.method} ${req.path}`);
  }

  // Check for Bearer token (required)
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log('🎫 Bearer token found, validating JWT...');
    }

    // Apply Auth0 JWT authentication
    return requireAuth[0](req, res, (err) => {
      if (err) {
        if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
          console.log('❌ JWT validation failed:', err.message);
        }
        return next(err);
      }
      if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
        console.log('✅ JWT validation succeeded');
      }
      requireAuth[1](req, res, next);
    });
  }

  // No Bearer token found - authentication required
  if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
    console.log('❌ No Bearer token found in Authorization header');
  }
  
  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please log in.',
    code: 'NO_AUTH'
  });
};

module.exports = authenticate;
