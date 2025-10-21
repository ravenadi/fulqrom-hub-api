/**
 * Middleware Configuration
 * Centralizes middleware constants and configurations to reduce code complexity
 */

// Public routes that bypass authentication
const PUBLIC_ROUTES = ['/auth', '/health', '/dropdowns', '/admin'];

// Module mapping: URL path -> module name for permission checking
const MODULE_MAP = {
  'customers': 'customers',
  'sites': 'sites',
  'buildings': 'buildings',
  'floors': 'floors',
  'building-tenants': 'tenants',
  'tenants': 'tenants',
  'documents': 'documents',
  'assets': 'assets',
  'vendors': 'vendors',
  'users': 'users',
  'roles': 'users', // roles are managed by users with user permissions
  'notifications': 'users', // notifications are user-related
  'analytics': 'analytics',
  'hierarchy': 'customers' // hierarchy is customer-related
};

// HTTP method to permission mapping
const METHOD_PERMISSION_MAP = {
  'GET': 'view',
  'POST': 'create',
  'PUT': 'edit',
  'PATCH': 'edit',
  'DELETE': 'delete',
  'default': 'view'
};

/**
 * Check if a route is public (requires no authentication)
 * @param {string} path - Request path
 * @returns {boolean}
 */
const isPublicRoute = (path) => {
  return PUBLIC_ROUTES.some(publicRoute => path.startsWith(publicRoute));
};

/**
 * Get module name from URL path
 * @param {string} path - Request path (e.g., '/customers/123')
 * @returns {string|null} Module name or null if not found
 */
const getModuleFromPath = (path) => {
  const pathSegments = path.split('/').filter(segment => segment);
  const moduleName = pathSegments[0];
  return MODULE_MAP[moduleName] || null;
};

/**
 * Get required permission based on HTTP method
 * @param {string} method - HTTP method (GET, POST, PUT, etc.)
 * @returns {string} Required permission
 */
const getPermissionFromMethod = (method) => {
  return METHOD_PERMISSION_MAP[method] || METHOD_PERMISSION_MAP.default;
};

module.exports = {
  PUBLIC_ROUTES,
  MODULE_MAP,
  METHOD_PERMISSION_MAP,
  isPublicRoute,
  getModuleFromPath,
  getPermissionFromMethod
};
