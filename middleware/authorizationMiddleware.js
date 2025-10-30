/**
 * Authorization Middleware
 * Checks module-level permissions for authenticated users
 * Simplified from server.js for better maintainability
 *
 * NOTE: checkModulePermission already handles:
 * - Admin role bypass
 * - User active status check
 * - Role-based permission validation
 */

const { checkModulePermission } = require('./checkPermission');
const {
  isPublicRoute,
  getModuleFromPath,
  getPermissionFromMethod
} = require('../config/middleware.config');

/**
 * Authorization middleware
 * Delegates to checkModulePermission for all permission checking logic
 */
const authorize = (req, res, next) => {
  // Skip authorization for public endpoints
  if (isPublicRoute(req.path)) {
    return next();
  }

  // Skip authorization for dropdowns (read-only data, no module-specific permissions needed)
  if (req.path.startsWith('/dropdowns')) {
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log(`⚠️  Skipping permission check for dropdowns endpoint: ${req.method} ${req.path}`);
    }
    return next();
  }

  // SECURITY FIX: Require authentication for all non-public routes
  // If user is not authenticated, deny access (authentication middleware should have set req.user)
  if (!req.user) {
    console.error(`⛔ Unauthenticated access attempt to protected route: ${req.method} ${req.path}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
      code: 'UNAUTHORIZED'
    });
  }

  // Get module name from path
  const targetModule = getModuleFromPath(req.path);

  // SECURITY FIX: Deny access if no module mapping found
  // This prevents new routes from accidentally bypassing security checks
  if (!targetModule) {
    console.error(`⛔ Route without module mapping (potential security bypass): ${req.method} ${req.path}`);
    return res.status(403).json({
      success: false,
      message: 'Route not authorized. No module mapping found for this endpoint.',
      code: 'MODULE_NOT_MAPPED',
      path: req.path,
      hint: 'Add this route to MODULE_MAP in config/middleware.config.js if it should be accessible'
    });
  }

  // Get required permission based on HTTP method
  const requiredPermission = getPermissionFromMethod(req.method);

  // Reduce logging verbosity - only log if DEBUG_LOGS is enabled
  if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
    console.log(`🔐 Checking ${requiredPermission} permission for module: ${targetModule}`);
  }

  // Apply module permission check - checkModulePermission handles all logic including Admin bypass
  checkModulePermission(targetModule, requiredPermission)(req, res, next);
};

module.exports = authorize;
