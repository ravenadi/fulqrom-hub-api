/**
 * Authentication Middleware
 * Handles JWT token validation from Auth0
 * Simplified from server.js for better maintainability
 */

const { requireAuth } = require('./auth0');
const { isPublicRoute } = require('../config/middleware.config');

/**
 * Authentication middleware
 * Validates JWT tokens for protected routes
 */
const authenticate = (req, res, next) => {
  // Skip authentication for public endpoints
  if (isPublicRoute(req.path)) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`✓ Bypassing auth for public endpoint: ${req.method} ${req.path}`);
    }
    return next();
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔒 Applying auth for protected endpoint: ${req.method} ${req.path}`);
  }

  // Apply Auth0 JWT authentication
  requireAuth[0](req, res, (err) => {
    if (err) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ JWT validation failed:', err.message);
      }
      return next(err);
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ JWT validation succeeded, attaching user...');
    }
    requireAuth[1](req, res, next);
  });
};

module.exports = authenticate;
