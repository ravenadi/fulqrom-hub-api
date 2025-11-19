/**
 * Rate Limiting Middleware
 * Protects API from abuse, brute force attacks, and resource exhaustion
 *
 * Uses express-rate-limit with in-memory store for single instance
 * For production multi-instance deployment, use Redis store
 */

const rateLimit = require('express-rate-limit');

/**
 * General API Rate Limiter
 * Applied to all authenticated API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for super admins (optional)
  skip: (req) => {
    return req.user?.role_ids?.some(role =>
      role?.name === 'Super Admin' || role?.name === 'Admin'
    );
  }
});

/**
 * Strict Rate Limiter for Authentication Endpoints
 * Prevents brute force attacks on login
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per 15 minutes
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * Strict Rate Limiter for File Upload Endpoints
 * Prevents storage abuse
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Limit each IP to 50 uploads per hour
  message: {
    success: false,
    message: 'Too many file uploads from this IP, please try again after 1 hour.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Lenient Rate Limiter for Public Endpoints
 * Health checks, registration, etc.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Very Strict Rate Limiter for Critical Operations
 * Password reset, MFA removal, user deletion
 */
const criticalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 attempts per hour
  message: {
    success: false,
    message: 'Too many attempts for this critical operation. Please try again later.',
    code: 'CRITICAL_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  publicLimiter,
  criticalLimiter
};
