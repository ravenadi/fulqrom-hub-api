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
      // Get authenticated user ID
      // TODO: Replace this with your actual authentication middleware that sets req.user
      // For now, we'll accept user_id from body, query, or params
      const userId = req.user?.id || req.user?._id || req.body?.user_id || req.query?.user_id || req.headers?.['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required. Please provide user_id in request.',
          hint: 'Add x-user-id header or user_id query parameter'
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

      // Fetch user with roles and permissions populated
      // Try different lookup strategies based on userId format
      let user = null;

      // Strategy 1: If userId is a valid MongoDB ObjectId (24 hex chars), try finding by _id
      const isValidObjectId = mongoose.Types.ObjectId.isValid(userId) &&
                              /^[0-9a-fA-F]{24}$/.test(userId);

      if (isValidObjectId) {
        user = await User.findById(userId).populate('role_ids').catch(() => null);
      }

      // Strategy 2: If not found, try finding by auth0_id (e.g., "auth0|...")
      if (!user) {
        user = await User.findOne({ auth0_id: userId }).populate('role_ids');
      }

      // Strategy 3: If still not found, try finding by custom_id field (for demo users)
      if (!user) {
        user = await User.findOne({ custom_id: userId }).populate('role_ids');
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          hint: 'The user_id does not match any user in the database'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive. Please contact administrator.'
        });
      }

      // Map action to permission field
      const permissionMap = {
        'view': 'can_view',
        'read': 'can_view',
        'create': 'can_create',
        'add': 'can_create',
        'edit': 'can_edit',
        'update': 'can_edit',
        'delete': 'can_delete',
        'remove': 'can_delete'
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
        const moduleName = `${resourceType}s`; // 'customer' -> 'customers'

        for (const role of user.role_ids) {
          if (!role.is_active) continue; // Skip inactive roles

          const modulePermission = role.permissions?.find(
            p => p.module_name === moduleName
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
      // Get authenticated user ID
      const userId = req.user?.id || req.user?._id || req.body?.user_id || req.query?.user_id || req.headers?.['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required. Please provide user_id in request.',
          hint: 'Add x-user-id header or user_id query parameter'
        });
      }

      // Fetch user with roles populated
      // Try different lookup strategies based on userId format
      let user = null;

      // Strategy 1: If userId is a valid MongoDB ObjectId (24 hex chars), try finding by _id
      const isValidObjectId = mongoose.Types.ObjectId.isValid(userId) &&
                              /^[0-9a-fA-F]{24}$/.test(userId);

      if (isValidObjectId) {
        user = await User.findById(userId).populate('role_ids').catch(() => null);
      }

      // Strategy 2: If not found, try finding by auth0_id (e.g., "auth0|...")
      if (!user) {
        user = await User.findOne({ auth0_id: userId }).populate('role_ids');
      }

      // Strategy 3: If still not found, try finding by custom_id field (for demo users)
      if (!user) {
        user = await User.findOne({ custom_id: userId }).populate('role_ids');
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          hint: 'The user_id does not match any user in the database'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive'
        });
      }

      // Map action to permission field
      const permissionMap = {
        'view': 'can_view',
        'read': 'can_view',
        'create': 'can_create',
        'add': 'can_create',
        'edit': 'can_edit',
        'update': 'can_edit',
        'delete': 'can_delete',
        'remove': 'can_delete'
      };
      const permissionField = permissionMap[action.toLowerCase()];

      // Check role permissions
      if (user.role_ids && user.role_ids.length > 0) {
        for (const role of user.role_ids) {
          if (!role.is_active) continue;

          const modulePermission = role.permissions?.find(
            p => p.module_name === moduleName
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
