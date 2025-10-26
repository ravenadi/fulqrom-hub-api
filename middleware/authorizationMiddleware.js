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
    console.log(`⚠️  Skipping permission check for dropdowns endpoint: ${req.method} ${req.path}`);
    return next();
  }

  // Skip authorization if user is not authenticated
  if (!req.user) {
    return next();
  }

  // Get module name from path
  const targetModule = getModuleFromPath(req.path);

  if (!targetModule) {
    console.log(`⚠️  No module mapping for path: ${req.path}`);
    return next(); // Allow if no mapping found
  }

  // Get required permission based on HTTP method
  const requiredPermission = getPermissionFromMethod(req.method);

  console.log(`🔐 Checking ${requiredPermission} permission for module: ${targetModule}`);

  // Apply module permission check - checkModulePermission handles all logic including Admin bypass
  checkModulePermission(targetModule, requiredPermission)(req, res, next);
};

module.exports = authorize;
