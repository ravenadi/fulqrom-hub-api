const User = require('../models/User');
const Role = require('../models/Role');
const mongoose = require('mongoose');

/**
 * Helper function to fetch user with proper ID handling
 * Handles both MongoDB ObjectId and Auth0 ID strings
 */
const fetchUserById = async (userId) => {
  // If userId is already a valid ObjectId, use it directly
  // Bypass tenant filter during auth/permission checks (we're looking up by ID, not tenant)
  if (mongoose.Types.ObjectId.isValid(userId)) {
    return await User.findById(userId).setOptions({ _bypassTenantFilter: true }).populate('role_ids');
  }
  
  // Otherwise, treat it as an auth0_id
  return await User.findOne({ auth0_id: userId }).setOptions({ _bypassTenantFilter: true }).populate('role_ids');
};

/**
 * Authorization Rules Middleware
 * Enforces the 5 authorization rules from the spreadsheet
 */

// Rule 1: Scope-based resource visibility
// When creating a user, filter available resources by creator's access
const getAccessibleResources = async (creatorUserId, resourceType) => {
  try {
    const creator = await fetchUserById(creatorUserId);
    if (!creator) {
      throw new Error('Creator user not found');
    }

    // IMPORTANT: Admin users have full access - bypass all resource filtering
    const isAdmin = creator.role_ids?.some(role => role.is_active && role.name === 'Admin');
    if (isAdmin) {
      return { hasFullAccess: true };
    }

    const accessibleResources = [];

    // Check if creator has module-level access
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
    const moduleName = moduleNameMap[resourceType];

    let hasModuleAccess = false;
    for (const role of creator.role_ids) {
      if (!role.is_active) continue;

      const modulePermission = role.permissions?.find(p => p.entity === moduleName);
      if (modulePermission && modulePermission.view) {
        hasModuleAccess = true;
        break;
      }
    }

    if (hasModuleAccess) {
      // Creator has module access, return all resources of this type
      // This would typically query the actual resource collection
      // For now, return a flag indicating full access
      return { hasFullAccess: true };
    }

    // Check resource-specific access
    const resourceAccess = creator.resource_access?.filter(
      ra => ra.resource_type === resourceType && ra.permissions?.can_view
    ) || [];

    return {
      hasFullAccess: false,
      accessibleResourceIds: resourceAccess.map(ra => ra.resource_id)
    };

  } catch (error) {
    console.error('Error getting accessible resources:', error);
    throw error;
  }
};

// Rule 2: Role-based user creation restrictions
// BM and above can create users, but not higher than own role (except Admin)
const canCreateUserWithRole = (creatorRole, targetRole) => {
  const roleHierarchy = ['Tenants', 'Contractor', 'Building Manager', 'Property Manager', 'Admin'];
  
  const creatorIndex = roleHierarchy.indexOf(creatorRole);
  const targetIndex = roleHierarchy.indexOf(targetRole);

  if (creatorIndex === -1 || targetIndex === -1) {
    return false; // Invalid roles
  }

  // Admin can create any role including another Admin
  if (creatorRole === 'Admin') {
    return true;
  }

  // Others can only create roles below their own level
  return targetIndex < creatorIndex;
};

// Rule 3: Document download with view access
// Automatically granted - view implies download
const canDownloadDocument = (user, documentId) => {
  // This will be implemented in document routes
  // For now, return true if user has view access
  return true;
};

// Rule 4: Access elevation rules
// Same as Rule 2 - BM and above, Admin can elevate to Admin
const canElevateUserAccess = (creatorRole, targetRole) => {
  return canCreateUserWithRole(creatorRole, targetRole);
};

// Rule 5: Scope-based data filtering
// Filter analytics and documents by user's assigned resources
const filterByUserScope = async (userId, query, resourceType) => {
  try {
    const user = await fetchUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // IMPORTANT: Admin users have full access - bypass all scope filtering
    const isAdmin = user.role_ids?.some(role => role.is_active && role.name === 'Admin');
    if (isAdmin) {
      return query; // Return original query without filtering
    }

    // Check if user has module-level access
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
    const moduleName = moduleNameMap[resourceType];

    let hasModuleAccess = false;
    for (const role of user.role_ids) {
      if (!role.is_active) continue;

      const modulePermission = role.permissions?.find(p => p.entity === moduleName);
      if (modulePermission && modulePermission.view) {
        hasModuleAccess = true;
        break;
      }
    }

    if (hasModuleAccess) {
      // User has module access, return original query (no filtering)
      return query;
    }

    // Filter by resource-specific access
    const resourceAccess = user.resource_access?.filter(
      ra => ra.resource_type === resourceType && ra.permissions?.can_view
    ) || [];

    if (resourceAccess.length === 0) {
      // No access to any resources of this type
      return { ...query, _id: { $in: [] } }; // Empty result set
    }

    // Filter by accessible resource IDs
    const accessibleIds = resourceAccess.map(ra => ra.resource_id);
    return { ...query, _id: { $in: accessibleIds } };

  } catch (error) {
    console.error('Error filtering by user scope:', error);
    throw error;
  }
};

// Middleware to validate user creation (Rules 1, 2)
const validateUserCreation = async (req, res, next) => {
  try {
    const creatorUserId = req.user?.id || req.user?._id || req.body?.creator_id;
    const { roleIds, resourceAccess } = req.body;

    if (!creatorUserId) {
      return res.status(401).json({
        success: false,
        message: 'Creator user ID required'
      });
    }

    // Get creator's role
    const creator = await fetchUserById(creatorUserId);
    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator user not found'
      });
    }

    // Get creator's highest role
    const roleHierarchy = ['Tenants', 'Contractor', 'Building Manager', 'Property Manager', 'Admin'];
    let creatorRole = 'Tenants'; // Default to lowest role
    
    for (const role of creator.role_ids) {
      if (!role.is_active) continue;
      const roleIndex = roleHierarchy.indexOf(role.name);
      if (roleIndex > roleHierarchy.indexOf(creatorRole)) {
        creatorRole = role.name;
      }
    }

    // Validate role assignments (Rule 2)
    if (roleIds && roleIds.length > 0) {
      for (const roleId of roleIds) {
        const role = await Role.findById(roleId);
        if (!role) {
          return res.status(400).json({
            success: false,
            message: `Role with ID ${roleId} not found`
          });
        }

        if (!canCreateUserWithRole(creatorRole, role.name)) {
          return res.status(403).json({
            success: false,
            message: `You cannot create users with role '${role.name}'. Your role '${creatorRole}' does not have sufficient privileges.`
          });
        }
      }
    }

    // Validate resource access assignments (Rule 1)
    if (resourceAccess && resourceAccess.length > 0) {
      for (const access of resourceAccess) {
        const accessibleResources = await getAccessibleResources(creatorUserId, access.resource_type);
        
        if (!accessibleResources.hasFullAccess && 
            !accessibleResources.accessibleResourceIds.includes(access.resource_id)) {
          return res.status(403).json({
            success: false,
            message: `You cannot assign access to ${access.resource_type} with ID ${access.resource_id}. You don't have access to this resource.`
          });
        }
      }
    }

    next();

  } catch (error) {
    console.error('User creation validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating user creation',
      error: error.message
    });
  }
};

// Middleware to validate user elevation (Rule 4)
const validateUserElevation = async (req, res, next) => {
  try {
    const creatorUserId = req.user?.id || req.user?._id || req.body?.creator_id;
    const { roleIds } = req.body;

    if (!creatorUserId) {
      return res.status(401).json({
        success: false,
        message: 'Creator user ID required'
      });
    }

    // Get creator's role
    const creator = await fetchUserById(creatorUserId);
    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator user not found'
      });
    }

    // Get creator's highest role
    const roleHierarchy = ['Tenants', 'Contractor', 'Building Manager', 'Property Manager', 'Admin'];
    let creatorRole = 'Tenants';
    
    for (const role of creator.role_ids) {
      if (!role.is_active) continue;
      const roleIndex = roleHierarchy.indexOf(role.name);
      if (roleIndex > roleHierarchy.indexOf(creatorRole)) {
        creatorRole = role.name;
      }
    }

    // Validate role elevation
    if (roleIds && roleIds.length > 0) {
      for (const roleId of roleIds) {
        const role = await Role.findById(roleId);
        if (!role) {
          return res.status(400).json({
            success: false,
            message: `Role with ID ${roleId} not found`
          });
        }

        if (!canElevateUserAccess(creatorRole, role.name)) {
          return res.status(403).json({
            success: false,
            message: `You cannot elevate users to role '${role.name}'. Your role '${creatorRole}' does not have sufficient privileges.`
          });
        }
      }
    }

    next();

  } catch (error) {
    console.error('User elevation validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating user elevation',
      error: error.message
    });
  }
};

// Document-specific filtering by category and discipline
const filterDocumentsByAccess = async (userId) => {
  try {
    const user = await fetchUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // IMPORTANT: Admin users have full access - bypass all permission checks
    const isAdmin = user.role_ids?.some(role => role.is_active && role.name === 'Admin');
    if (isAdmin) {
      return {
        hasFullAccess: true,
        allowedCategories: [],
        allowedDisciplines: [],
        categoryPermissions: [],
        disciplinePermissions: []
      };
    }

    // Check if user has module-level document access
    let hasModuleAccess = false;
    for (const role of user.role_ids) {
      if (!role.is_active) continue;

      const modulePermission = role.permissions?.find(p => p.entity === 'documents');
      if (modulePermission && modulePermission.view) {
        hasModuleAccess = true;
        break;
      }
    }

    if (hasModuleAccess) {
      // Has module access - check for category/discipline restrictions
      const categoryRestrictions = user.resource_access?.filter(
        ra => ra.resource_type === 'document_category' && ra.permissions?.can_view
      ) || [];

      const disciplineRestrictions = user.resource_access?.filter(
        ra => ra.resource_type === 'document_discipline' && ra.permissions?.can_view
      ) || [];

      // Also check user's document_categories field (new approach)
      const userDocumentCategories = user.document_categories || [];
      const userEngineeringDisciplines = user.engineering_disciplines || [];

      // Combine resource access categories with user field categories
      const allAllowedCategories = [
        ...categoryRestrictions.map(ra => ra.resource_id),
        ...userDocumentCategories
      ];

      const allAllowedDisciplines = [
        ...disciplineRestrictions.map(ra => ra.resource_id),
        ...userEngineeringDisciplines
      ];

      return {
        hasFullAccess: categoryRestrictions.length === 0 && disciplineRestrictions.length === 0 && userDocumentCategories.length === 0 && userEngineeringDisciplines.length === 0,
        allowedCategories: allAllowedCategories,
        allowedDisciplines: allAllowedDisciplines,
        categoryPermissions: categoryRestrictions,
        disciplinePermissions: disciplineRestrictions,
        userDocumentCategories: userDocumentCategories,
        userEngineeringDisciplines: userEngineeringDisciplines
      };
    }

    // No module access - return empty filters
    return {
      hasFullAccess: false,
      allowedCategories: [],
      allowedDisciplines: [],
      categoryPermissions: [],
      disciplinePermissions: []
    };

  } catch (error) {
    console.error('Error filtering documents by access:', error);
    throw error;
  }
};

// Middleware to apply scope filtering (Rule 5)
const applyScopeFiltering = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id || req.headers?.['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID required for scope filtering'
        });
      }

      // Store original query
      req.originalQuery = req.query;

      // Apply scope filtering
      const filteredQuery = await filterByUserScope(userId, req.query, resourceType);
      req.query = filteredQuery;

      // For documents, also apply category/discipline filtering
      if (resourceType === 'document') {
        const documentFilters = await filterDocumentsByAccess(userId);
        req.documentFilters = documentFilters; // Attach to request for use in routes
      }

      next();

    } catch (error) {
      console.error('Scope filtering error:', error);
      res.status(500).json({
        success: false,
        message: 'Error applying scope filtering',
        error: error.message
      });
    }
  };
};

module.exports = {
  getAccessibleResources,
  canCreateUserWithRole,
  canDownloadDocument,
  canElevateUserAccess,
  filterByUserScope,
  filterDocumentsByAccess,
  validateUserCreation,
  validateUserElevation,
  applyScopeFiltering
};
