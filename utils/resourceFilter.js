const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Apply resource-level filtering to query based on user's resource_access
 * This function checks if a user has specific resource assignments and filters accordingly
 *
 * HIERARCHICAL PERMISSIONS:
 * - If user has access to customer → can see all sites, buildings, floors, assets under that customer
 * - If user has access to site → can see all buildings, floors, assets under that site
 * - If user has access to building → can see all floors and assets under that building
 *
 * @param {Object} req - Express request object (must have req.user populated)
 * @param {Object} filterQuery - MongoDB filter query object to be modified
 * @param {string} resourceType - Type of resource ('customer', 'site', 'building', 'asset', 'floor', 'tenant', 'vendor', 'document')
 * @returns {Promise<Object>} - Modified filter query with resource filtering applied
 *
 * @example
 * // In a route handler
 * let filterQuery = { is_delete: { $ne: true } };
 * filterQuery = await applyResourceFilter(req, filterQuery, 'customer');
 * const customers = await Customer.find(filterQuery);
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

    // Get all resource access entries for the user
    const allResourceAccess = currentUser.resource_access || [];

    // If no resource access entries at all, user has module-level access (via role permissions)
    // and can see all resources of this type within their tenant
    if (allResourceAccess.length === 0) {
      return filterQuery; // No resource restrictions
    }

    // Apply STRICT filtering - only show explicitly assigned resources
    const strictFilter = applyStrictFilter(allResourceAccess, resourceType, filterQuery,
      (ids) => ids.map(id => {
        if (id instanceof mongoose.Types.ObjectId) return id;
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      })
    );

    if (strictFilter) {
      return strictFilter;
    }

    // No restrictions for this resource type
    return filterQuery;

  } catch (error) {
    console.error('Error applying resource filter:', error);
    throw error;
  }
}

/**
 * Apply strict resource filtering (no hierarchical expansion)
 * Only shows resources that are explicitly assigned to the user
 *
 * @param {Array} allResourceAccess - User's resource_access array
 * @param {string} resourceType - Type of resource being filtered
 * @param {Object} filterQuery - MongoDB filter query
 * @param {Function} toObjectIds - Helper function to convert IDs to ObjectId
 */
function applyStrictFilter(allResourceAccess, resourceType, filterQuery, toObjectIds) {
  // Get only resources of the specific type
  const directAccess = allResourceAccess.filter(
    ra => ra.resource_type === resourceType && ra.permissions?.can_view
  );

  if (directAccess.length === 0) {
    // No access to this resource type - return null (no filtering, falls back to role-based)
    return null;
  }

  // Filter to only explicitly assigned resources
  const allowedIds = directAccess.map(ra => ra.resource_id);

  console.log(`🔒 STRICT MODE - ${resourceType}: Only showing explicitly assigned resources:`, allowedIds);

  if (filterQuery._id) {
    filterQuery.$and = filterQuery.$and || [];
    filterQuery.$and.push({ _id: { $in: toObjectIds(allowedIds) } });
  } else {
    filterQuery._id = { $in: toObjectIds(allowedIds) };
  }

  return filterQuery;
}

/**
 * Check if user has access to a specific resource
 * This is useful for single-resource routes (e.g., GET /api/customers/:id)
 *
 * @param {Object} req - Express request object (must have req.user populated)
 * @param {string} resourceType - Type of resource ('customer', 'site', 'building', 'asset', etc.)
 * @param {string} resourceId - ID of the specific resource to check
 * @returns {Promise<boolean>} - True if user has access, false otherwise
 *
 * @example
 * // In a route handler
 * const hasAccess = await hasResourceAccess(req, 'customer', customerId);
 * if (!hasAccess) {
 *   return res.status(403).json({ message: 'Access denied' });
 * }
 */
async function hasResourceAccess(req, resourceType, resourceId) {
  try {
    // Ensure we have a user
    if (!req.user || !req.user._id) {
      return false;
    }

    // Fetch current user with roles populated
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
      return true; // Module-level access via role
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
 * Returns null if user has unrestricted access (module-level)
 * Returns array of IDs if user has specific resource assignments
 *
 * @param {Object} req - Express request object (must have req.user populated)
 * @param {string} resourceType - Type of resource ('customer', 'site', 'building', 'asset', etc.)
 * @returns {Promise<Array|null>} - Array of accessible resource IDs, or null for unrestricted access
 *
 * @example
 * const accessibleIds = await getAccessibleResourceIds(req, 'customer');
 * if (accessibleIds === null) {
 *   console.log('User has unrestricted access to all customers');
 * } else {
 *   console.log('User can only access:', accessibleIds);
 * }
 */
async function getAccessibleResourceIds(req, resourceType) {
  try {
    // Ensure we have a user
    if (!req.user || !req.user._id) {
      return [];
    }

    // Fetch current user with roles populated
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
