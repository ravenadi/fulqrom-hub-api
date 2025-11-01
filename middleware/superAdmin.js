const User = require('../models/User');
const Role = require('../models/v2/Role');
const mongoose = require('mongoose');

/**
 * Helper function to fetch user with proper ID handling
 * Handles both MongoDB ObjectId and Auth0 ID strings
 */
const fetchUserById = async (userId) => {
  // User model has autoFilter: false, so no tenant filtering is applied
  if (mongoose.Types.ObjectId.isValid(userId)) {
    return await User.findById(userId).populate('role_ids');
  }

  // Otherwise, treat it as an auth0_id
  return await User.findOne({ auth0_id: userId }).populate('role_ids');
};

/**
 * Super Admin Authentication Middleware
 * Checks if the authenticated user is a super admin via Auth0 JWT claims
 */
const checkSuperAdmin = async (req, res, next) => {
  try {
    
    

    // Check Auth0 JWT claims first (primary method for super_admin)
    const payload = req.auth?.payload || req.auth;
    if (payload) {
      // Auth0 stores custom roles in a namespaced claim
      const auth0Roles = payload['https://fulqrom.com.au/roles'] || [];

      if (auth0Roles.includes('super_admin')) {
        // Super admin authenticated via Auth0 - no database record needed
        req.superAdmin = {
          id: payload.sub,
          email: payload.email || payload['https://fulqrom.com.au/email'],
          full_name: payload.name || payload['https://fulqrom.com.au/name'] || 'Super Admin',
          auth0_id: payload.sub,
          permissions: {
            can_manage_tenants: true,
            can_manage_users: true,
            can_manage_plans: true,
            can_view_analytics: true,
            can_manage_roles: true,
            can_view_audit_logs: true
          }
        };
        return next();
      }
    }

    // Fallback: Check database for existing super_admin users (legacy)
    const userId = req.user?.id || req.user?._id || req.body?.user_id || req.query?.user_id || req.headers?.['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Super admin privileges required.',
        hint: 'Provide valid Auth0 JWT token with super_admin role'
      });
    }

    const user = await fetchUserById(userId);
    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.',
        error_code: 'SUPER_ADMIN_REQUIRED'
      });
    }

    const superAdminRole = await Role.findOne({
      name: 'super_admin',
      tenant_id: null,
      is_active: true
    });

    if (!superAdminRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.',
        error_code: 'SUPER_ADMIN_REQUIRED'
      });
    }

    const hasSuperAdminRole = user.role_ids.some(role =>
      role._id.toString() === superAdminRole._id.toString()
    );

    if (!hasSuperAdminRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.',
        error_code: 'SUPER_ADMIN_REQUIRED',
        user_id: userId
      });
    }

    req.superAdmin = {
      id: user._id,
      email: user.email,
      full_name: user.full_name,
      permissions: {
        can_manage_tenants: true,
        can_manage_users: true,
        can_manage_plans: true,
        can_view_analytics: true,
        can_manage_roles: true,
        can_view_audit_logs: true
      }
    };

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking super admin privileges',
      error: error.message
    });
  }
};

/**
 * Super Admin Permission Check Middleware
 * Checks specific super admin permissions
 */
const checkSuperAdminPermission = (permission) => {
  return (req, res, next) => {
    if (!req.superAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Super admin authentication required'
      });
    }

    const permissions = req.superAdmin.permissions;
    
    // Check if super admin has the required permission
    if (!permissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Permission '${permission}' required.`,
        error_code: 'PERMISSION_DENIED',
        required_permission: permission
      });
    }

    next();
  };
};


module.exports = {
  checkSuperAdmin,
  checkSuperAdminPermission
};
