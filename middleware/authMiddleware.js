/**
 * Authentication Middleware (Dual Mode: Session + Bearer)
 * 
 * Primary: Cookie-based session authentication (BFF pattern)
 * Fallback: Bearer token (Auth0 JWT) if ALLOW_BEARER=true
 * 
 * This allows graceful migration from Bearer to sessions.
 */

const { requireAuth } = require('./auth0');
const { isPublicRoute } = require('../config/middleware.config');
const { authenticateSession } = require('./sessionAuth');

// Check if legacy Bearer auth is allowed
const ALLOW_BEARER = process.env.ALLOW_BEARER === 'true';

/**
 * Authentication middleware with dual support
 * Tries session auth first, falls back to Bearer if enabled
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

  // Check for session cookie first (preferred)
  if (req.cookies?.sid) {
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log('🍪 Session cookie found, using session auth');
    }
    return authenticateSession(req, res, next);
  }

  // Check for Bearer token if allowed
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (!ALLOW_BEARER) {
      if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
        console.log('❌ Bearer token provided but ALLOW_BEARER=false');
      }
      return res.status(401).json({
        success: false,
        message: 'Bearer token authentication is deprecated. Please use cookie-based authentication.',
        code: 'BEARER_DEPRECATED'
      });
    }

    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log('🎫 Bearer token found, using JWT auth (legacy mode)');
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
        console.log('✅ JWT validation succeeded, attaching user...');
      }
      requireAuth[1](req, res, next);
    });
  }

  // No valid auth found
  if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
    console.log('❌ No session cookie or Bearer token found');
  }
  
  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please log in.',
    code: 'NO_AUTH'
  });
};

module.exports = authenticate;
