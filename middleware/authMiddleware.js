/**
 * Authentication Middleware - Session or Bearer Token
 *
 * Supports both session cookies and Auth0 JWT Bearer tokens for authentication.
 * Priority: Bearer token > Session cookie
 */

const { requireAuth } = require('./auth0');
const { authenticateSession } = require('./sessionAuth');
const { isPublicRoute } = require('../config/middleware.config');

/**
 * Authentication middleware - Session or Bearer tokens
 * Validates Auth0 JWT from Authorization header OR session cookie
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

  // Check for Bearer token first (priority)
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

  // Check for session cookie (fallback)
  const sessionId = req.cookies?.sid;
  if (sessionId) {
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log('🍪 Session cookie found, validating session...');
    }

    // Apply session authentication
    return authenticateSession(req, res, next);
  }

  // No Bearer token or session cookie found - authentication required
  if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
    console.log('❌ No Bearer token or session cookie found');
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please log in.',
    code: 'NO_AUTH'
  });
};

module.exports = authenticate;
