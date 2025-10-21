const Role = require('../../models/Role');
const User = require('../../models/User');

/**
 * Get all predefined roles
 * @route GET /api/v2/roles
 * @access Public (for now, can be restricted later)
 */
const getAllRoles = async (req, res) => {
  try {
    const { page = 1, limit = 50, is_active } = req.query;

    // Build filter query
    let filterQuery = {};
    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch roles
    const [roles, totalRoles] = await Promise.all([
      Role.find(filterQuery)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Role.countDocuments(filterQuery)
    ]);

    // Get user counts for each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ role_ids: role._id });
        return {
          ...role,
          user_count: userCount
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Roles fetched successfully',
      count: rolesWithCounts.length,
      total: totalRoles,
      page: pageNum,
      pages: Math.ceil(totalRoles / limitNum),
      data: rolesWithCounts
    });

  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: error.message
    });
  }
};

/**
 * Get role by ID
 * @route GET /api/v2/roles/:id
 * @access Public (for now, can be restricted later)
 */
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role ID format'
      });
    }

    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Get user count
    const userCount = await User.countDocuments({ role_ids: role._id });

    res.status(200).json({
      success: true,
      message: 'Role fetched successfully',
      data: {
        ...role.toObject(),
        user_count: userCount
      }
    });

  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role',
      error: error.message
    });
  }
};

/**
 * Get role by name
 * @route GET /api/v2/roles/name/:name
 * @access Public (for now, can be restricted later)
 */
const getRoleByName = async (req, res) => {
  try {
    const { name } = req.params;

    const role = await Role.findOne({ name: name });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Get user count
    const userCount = await User.countDocuments({ role_ids: role._id });

    res.status(200).json({
      success: true,
      message: 'Role fetched successfully',
      data: {
        ...role.toObject(),
        user_count: userCount
      }
    });

  } catch (error) {
    console.error('Error fetching role by name:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role',
      error: error.message
    });
  }
};

/**
 * Initialize predefined roles (Admin only)
 * @route POST /api/v2/roles/initialize
 * @access Admin only
 */
const initializePredefinedRoles = async (req, res) => {
  try {
    // TODO: Add admin permission check here
    // For now, allowing any authenticated user to initialize
    
    await Role.initializePredefinedRoles();

    res.status(200).json({
      success: true,
      message: 'Predefined roles initialized successfully'
    });

  } catch (error) {
    console.error('Error initializing predefined roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error initializing predefined roles',
      error: error.message
    });
  }
};

/**
 * Get role permissions matrix
 * @route GET /api/v2/roles/permissions/matrix
 * @access Public (for now, can be restricted later)
 */
const getPermissionsMatrix = async (req, res) => {
  try {
    const roles = await Role.find({ is_active: true }).lean();
    
    // Create permissions matrix
    const entities = ['org', 'sites', 'buildings', 'floors', 'tenants', 'documents', 'assets', 'vendors', 'customers', 'users', 'analytics'];
    const permissions = ['view', 'create', 'edit', 'delete'];
    
    const matrix = roles.map(role => {
      const rolePermissions = {};
      entities.forEach(entity => {
        rolePermissions[entity] = {};
        permissions.forEach(permission => {
          rolePermissions[entity][permission] = false;
        });
        
        // Find permission for this entity
        const entityPermission = role.permissions.find(p => p.entity === entity);
        if (entityPermission) {
          rolePermissions[entity] = {
            view: entityPermission.view,
            create: entityPermission.create,
            edit: entityPermission.edit,
            delete: entityPermission.delete
          };
        }
      });
      
      return {
        role_name: role.name,
        role_description: role.description,
        permissions: rolePermissions
      };
    });

    res.status(200).json({
      success: true,
      message: 'Permissions matrix fetched successfully',
      data: {
        entities,
        permissions,
        matrix
      }
    });

  } catch (error) {
    console.error('Error fetching permissions matrix:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching permissions matrix',
      error: error.message
    });
  }
};

module.exports = {
  getAllRoles,
  getRoleById,
  getRoleByName,
  initializePredefinedRoles,
  getPermissionsMatrix
};
