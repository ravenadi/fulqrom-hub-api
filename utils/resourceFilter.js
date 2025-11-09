const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Apply STRICT resource filtering
 * Users only see resources explicitly assigned in their resource_access array
 *
 * SIMPLE RULE:
 * - Customer selected? → Show ONLY that customer
 * - Site selected? → Show ONLY that site
 * - Building selected? → Show ONLY that building
 * - Floor selected? → Show ONLY that floor
 * - Asset selected? → Show ONLY that asset
 *
 * NO HIERARCHY - NO PARENT-CHILD EXPANSION
 */
async function applyResourceFilter(req, filterQuery, resourceType) {
  try {
    // Ensure we have a user
    if (!req.user || !req.user._id) {
      throw new Error('User context required for resource filtering');
    }

    // Fetch current user with roles populated
    let currentUser = null;
    if (mongoose.Types.ObjectId.isValid(req.user._id)) {
      currentUser = await User.findById(req.user._id).populate('role_ids');
    } else {
      // Handle Auth0 ID
      currentUser = await User.findOne({ auth0_id: req.user._id }).populate('role_ids');
    }

    if (!currentUser) {
      throw new Error('User not found in database');
    }

    // Check if user is Super Admin (bypass all filtering)
    if (req.user.is_super_admin || currentUser.is_super_admin) {
      return filterQuery; // No filtering for super admin
    }

    // Check if user has Admin role (bypass all filtering)
    const isAdmin = currentUser.role_ids?.some(role =>
      role.is_active && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
    );

    if (isAdmin) {
      return filterQuery; // No filtering for Admin users
    }

    // Get user's resource_access entries
    const allResourceAccess = currentUser.resource_access || [];

    // If no resource access entries at all, user has module-level access (via role permissions)
    // and can see all resources of this type within their tenant
    if (allResourceAccess.length === 0) {
      return filterQuery; // No resource restrictions
    }

    // Filter to ONLY the specific resource type with view permission
    const directAccess = allResourceAccess.filter(
      ra => ra.resource_type === resourceType && ra.permissions?.can_view
    );

    // If no access to this specific resource type, return unfiltered
    // (User might have role-based module access)
    if (directAccess.length === 0) {
      return filterQuery; // No restrictions for this resource type
    }

    // Extract resource IDs
    const allowedIds = directAccess.map(ra => {
      // Convert to ObjectId if it's a valid string
      if (typeof ra.resource_id === 'string' && mongoose.Types.ObjectId.isValid(ra.resource_id)) {
        return new mongoose.Types.ObjectId(ra.resource_id);
      }
      return ra.resource_id;
    });

    console.log(`🔒 STRICT MODE - ${resourceType}: Showing ONLY explicitly assigned:`, allowedIds.map(id => id.toString()));

    // Add the filter to show ONLY these specific resources
    if (filterQuery._id) {
      // If _id filter already exists, merge with $and
      filterQuery.$and = filterQuery.$and || [];
      filterQuery.$and.push({ _id: { $in: allowedIds } });
    } else {
      // Set _id filter directly
      filterQuery._id = { $in: allowedIds };
    }

    return filterQuery;

  } catch (error) {
    console.error('Error applying resource filter:', error);
    throw error;
  }
}

/**
 * Check if user has access to a specific resource
 */
async function hasResourceAccess(req, resourceType, resourceId) {
  try {
    if (!req.user || !req.user._id) {
      return false;
    }

    let currentUser = null;
    if (mongoose.Types.ObjectId.isValid(req.user._id)) {
      currentUser = await User.findById(req.user._id).populate('role_ids');
    } else {
      currentUser = await User.findOne({ auth0_id: req.user._id }).populate('role_ids');
    }

    if (!currentUser) {
      return false;
    }

    // Super admin has access to everything
    if (req.user.is_super_admin || currentUser.is_super_admin) {
      return true;
    }

    // Admin role has access to everything
    const isAdmin = currentUser.role_ids?.some(role =>
      role.is_active && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
    );

    if (isAdmin) {
      return true;
    }

    // Check resource_access
    const resourceAccess = currentUser.resource_access?.filter(
      ra => ra.resource_type === resourceType && ra.permissions?.can_view
    ) || [];

    // If no specific resource access, user has module-level access
    if (resourceAccess.length === 0) {
      return true;
    }

    // Check if this specific resource is in the allowed list
    const resourceIdStr = resourceId.toString();
    return resourceAccess.some(ra => ra.resource_id.toString() === resourceIdStr);

  } catch (error) {
    console.error('Error checking resource access:', error);
    return false;
  }
}

/**
 * Get list of accessible resource IDs for a user
 */
async function getAccessibleResourceIds(req, resourceType) {
  try {
    if (!req.user || !req.user._id) {
      return [];
    }

    let currentUser = null;
    if (mongoose.Types.ObjectId.isValid(req.user._id)) {
      currentUser = await User.findById(req.user._id).populate('role_ids');
    } else {
      currentUser = await User.findOne({ auth0_id: req.user._id }).populate('role_ids');
    }

    if (!currentUser) {
      return [];
    }

    // Super admin has unrestricted access
    if (req.user.is_super_admin || currentUser.is_super_admin) {
      return null;
    }

    // Admin role has unrestricted access
    const isAdmin = currentUser.role_ids?.some(role =>
      role.is_active && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
    );

    if (isAdmin) {
      return null;
    }

    // Get user's resource_access for this specific resource type
    const resourceAccess = currentUser.resource_access?.filter(
      ra => ra.resource_type === resourceType && ra.permissions?.can_view
    ) || [];

    // If no specific resource access, return null (unrestricted)
    if (resourceAccess.length === 0) {
      return null;
    }

    // Return list of accessible resource IDs
    return resourceAccess.map(ra => ra.resource_id);

  } catch (error) {
    console.error('Error getting accessible resource IDs:', error);
    return [];
  }
}

module.exports = {
  applyResourceFilter,
  hasResourceAccess,
  getAccessibleResourceIds
};
