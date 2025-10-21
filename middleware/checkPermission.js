const User = require('../models/User');
const Role = require('../models/Role');
const mongoose = require('mongoose');

/**
 * Check if user has permission for a specific resource
 * This middleware checks both:
 * 1. Resource-specific permissions (user.resource_access)
 * 2. Role-based module permissions (fallback)
 *
 * @param {string} resourceType - Type of resource (e.g., 'customer', 'site', 'asset')
 * @param {string} action - Action type: 'view', 'create', 'edit', 'delete'
 * @param {Function} getResourceId - Function to extract resource ID from request
 *
 * @example
 * // Apply to a route
 * router.get('/:id',
 *   checkResourcePermission('customer', 'view', (req) => req.params.id),
 *   async (req, res) => { ... }
 * );
 */
const checkResourcePermission = (resourceType, action, getResourceId) => {
  return async (req, res, next) => {
    try {
      // req.user is already populated by auth0.js middleware with MongoDB user data
      // If req.user exists, it means authentication succeeded
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // Get resource ID from request
      const resourceId = getResourceId(req);
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID not provided in request'
        });
      }

      // req.user already has the user data from MongoDB with populated roles
      // We need to re-fetch to ensure role_ids are populated with full role objects
      const user = await User.findById(req.user._id).populate('role_ids');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in system.'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive. Please contact administrator.'
        });
      }

      // CHECK 0: Bypass permission checks for Admin role
      if (user.role_ids && user.role_ids.length > 0) {
        const hasAdminRole = user.role_ids.some(role =>
          role.is_active && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
        );

        if (hasAdminRole) {
          console.log(`✅ Admin bypass: ${user.email} has Admin role - granting access`);
          req.permissionSource = 'admin_role';
          return next();
        }
      }

      // Map action to permission field (using v2 schema: view, create, edit, delete)
      const permissionMap = {
        'view': 'view',
        'read': 'view',
        'create': 'create',
        'add': 'create',
        'edit': 'edit',
        'update': 'edit',
        'delete': 'delete',
        'remove': 'delete'
      };
      const permissionField = permissionMap[action.toLowerCase()];

      if (!permissionField) {
        return res.status(400).json({
          success: false,
          message: `Invalid action: ${action}. Must be one of: view, create, edit, delete`
        });
      }

      // CHECK 1: Resource-specific permissions (highest priority)
      const resourceAccess = user.resource_access?.find(
        ra => ra.resource_type === resourceType && ra.resource_id === resourceId
      );

      if (resourceAccess) {
        // User has specific access to this resource - check permission
        if (resourceAccess.permissions?.[permissionField]) {
          // Permission granted via resource access
          req.permissionSource = 'resource_access';
          req.resourceAccess = resourceAccess;
          return next();
        } else {
          return res.status(403).json({
            success: false,
            message: `Access denied. You don't have ${action} permission for this ${resourceType}.`,
            resource_id: resourceId,
            your_permissions: resourceAccess.permissions
          });
        }
      }

      // CHECK 2: Role-based module permissions (fallback)
      // This allows users with module-level permissions to access all resources
      if (user.role_ids && user.role_ids.length > 0) {
        // Map resource types to module names
        const moduleNameMap = {
          'org': 'org',
          'site': 'sites',
          'building': 'buildings', 
          'floor': 'floors',
          'tenant': 'tenants',
          'document': 'documents',
          'asset': 'assets',
          'vendor': 'vendors',
          'customer': 'customers',
          'user': 'users',
          'analytics': 'analytics'
        };
        const moduleName = moduleNameMap[resourceType] || `${resourceType}s`;

        for (const role of user.role_ids) {
          if (!role.is_active) continue; // Skip inactive roles

          const modulePermission = role.permissions?.find(
            p => p.entity === moduleName
          );

          if (modulePermission && modulePermission[permissionField]) {
            // Permission granted via role
            req.permissionSource = 'role';
            req.roleName = role.name;
            return next();
          }
        }
      }

      // No permission found
      return res.status(403).json({
        success: false,
        message: `Access denied. You don't have access to this ${resourceType}.`,
        resource_id: resourceId,
        required_permission: action,
        hint: 'Contact your administrator to request access to this resource.'
      });

    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

/**
 * Check if user has module-level permission (via roles)
 * This doesn't check resource-specific access, only role permissions
 *
 * @param {string} moduleName - Module name (e.g., 'customers', 'sites')
 * @param {string} action - Action type: 'view', 'create', 'edit', 'delete'
 *
 * @example
 * // Apply to a route
 * router.get('/',
 *   checkModulePermission('customers', 'view'),
 *   async (req, res) => { ... }
 * );
 */
const checkModulePermission = (moduleName, action) => {
  return async (req, res, next) => {
    try {
      // req.user is already populated by auth0.js middleware with MongoDB user data
      // If req.user exists, it means authentication succeeded
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // req.user already has the user data from MongoDB with populated roles
      // We need to re-fetch to ensure role_ids are populated with full role objects
      const user = await User.findById(req.user._id).populate('role_ids');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in system.'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive'
        });
      }

      // CHECK 0: Bypass permission checks for Admin role
      if (user.role_ids && user.role_ids.length > 0) {
        const hasAdminRole = user.role_ids.some(role =>
          role.is_active && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
        );

        if (hasAdminRole) {
          console.log(`✅ Admin bypass: ${user.email} has Admin role - granting access to ${moduleName}`);
          req.permissionSource = 'admin_role';
          return next();
        }
      }

      // Map action to permission field (using v2 schema: view, create, edit, delete)
      const permissionMap = {
        'view': 'view',
        'read': 'view',
        'create': 'create',
        'add': 'create',
        'edit': 'edit',
        'update': 'edit',
        'delete': 'delete',
        'remove': 'delete'
      };
      const permissionField = permissionMap[action.toLowerCase()];

      // Check role permissions
      if (user.role_ids && user.role_ids.length > 0) {
        for (const role of user.role_ids) {
          if (!role.is_active) continue;

          const modulePermission = role.permissions?.find(
            p => p.entity === moduleName
          );

          if (modulePermission && modulePermission[permissionField]) {
            req.permissionSource = 'role';
            req.roleName = role.name;
            return next();
          }
        }
      }

      // No permission found
      return res.status(403).json({
        success: false,
        message: `Access denied. You don't have ${action} permission for ${moduleName}.`,
        required_permission: `${action}:${moduleName}`
      });

    } catch (error) {
      console.error('Module permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking module permissions',
        error: error.message
      });
    }
  };
};

module.exports = {
  checkResourcePermission,
  checkModulePermission
};
