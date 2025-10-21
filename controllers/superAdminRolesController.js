const Role = require('../models/v2/Role');
const User = require('../models/User');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');

/**
 * Get all roles with permissions
 * @route GET /api/admin/roles
 * @access Super Admin only
 */
const getAllRoles = async (req, res) => {
  try {
    const { search } = req.query;

    // Build filter query
    let filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get roles with user count
    const roles = await Role.find(filter)
      .lean();

    // Get user count for each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const usersCount = await User.countDocuments({ 
          role_ids: role._id
        });

        return {
          id: role._id,
          name: role.name,
          description: role.description,
          document_type: role.document_type,
          engineering_discipline: role.engineering_discipline,
          is_active: role.is_active ?? true,
          is_system: false, // TODO: Add if needed
          users_count: usersCount,
          permissions: role.permissions || [],
          created_at: role.created_at,
          updated_at: role.updated_at
        };
      })
    );

    res.status(200).json({
      success: true,
      data: rolesWithCounts
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles: ' + error.message
    });
  }
};

/**
 * Create new role
 * @route POST /api/admin/roles
 * @access Super Admin only
 */
const createRole = async (req, res) => {
  try {
    const {
      name,
      description,
      document_type,
      engineering_discipline,
      permissions = []
    } = req.body;

    // Validate required fields
    const validationErrors = {};
    
    if (!name) {
      validationErrors.name = ['The name field is required.'];
    } else if (name.length > 255) {
      validationErrors.name = ['The name may not be greater than 255 characters.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if role with same name exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: {
          name: ['The name has already been taken.']
        }
      });
    }

    // Create role
    const role = new Role({
      name,
      description,
      document_type,
      engineering_discipline,
      permissions,
      is_active: true,
      created_by: req.superAdmin?.email || 'super_admin'
    });

    await role.save();

    // Log audit
    await AuditLog.create({
      action: 'create',
      resource_type: 'role',
      resource_id: role._id,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        role_name: name
      }
    });

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: {
        id: role._id,
        name: role.name,
        description: role.description,
        document_type: role.document_type,
        engineering_discipline: role.engineering_discipline,
        is_active: role.is_active,
        is_system: false,
        users_count: 0,
        permissions: role.permissions,
        created_at: role.created_at,
        updated_at: role.updated_at
      }
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating role: ' + error.message
    });
  }
};

/**
 * Get specific role details
 * @route GET /api/admin/roles/:id
 * @access Super Admin only
 */
const getRoleById = async (req, res) => {
  try {
    const { role } = req.params;

    const roleData = await Role.findById(role);
    if (!roleData) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Get user count for this role
    const usersCount = await User.countDocuments({ role_ids: role });

    res.status(200).json({
      success: true,
      data: {
        id: roleData._id,
        name: roleData.name,
        description: roleData.description,
        document_type: roleData.document_type,
        engineering_discipline: roleData.engineering_discipline,
        is_active: roleData.is_active,
        is_system: false,
        users_count: usersCount,
        permissions: roleData.permissions || [],
        created_at: roleData.created_at,
        updated_at: roleData.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role: ' + error.message
    });
  }
};

/**
 * Update role
 * @route PUT /api/admin/roles/:id
 * @access Super Admin only
 */
const updateRole = async (req, res) => {
  try {
    const { role } = req.params;
    const {
      name,
      description,
      document_type,
      engineering_discipline,
      permissions,
      is_active
    } = req.body;

    // Validate input
    const validationErrors = {};
    
    if (name && name.length > 255) {
      validationErrors.name = ['The name may not be greater than 255 characters.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const roleData = await Role.findById(role);
    if (!roleData) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== roleData.name) {
      const existingRole = await Role.findOne({ 
        name, 
        _id: { $ne: role } 
      });
      if (existingRole) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: {
            name: ['The name has already been taken.']
          }
        });
      }
    }

    // Update role data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (document_type !== undefined) updateData.document_type = document_type;
    if (engineering_discipline !== undefined) updateData.engineering_discipline = engineering_discipline;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (is_active !== undefined) updateData.is_active = is_active;

    const updatedRole = await Role.findByIdAndUpdate(
      role,
      updateData,
      { new: true, runValidators: true }
    );

    // Get user count for this role
    const usersCount = await User.countDocuments({ role_ids: role });

    // Log audit
    await AuditLog.create({
      action: 'update',
      resource_type: 'role',
      resource_id: role,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: updateData
    });

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: {
        id: updatedRole._id,
        name: updatedRole.name,
        description: updatedRole.description,
        document_type: updatedRole.document_type,
        engineering_discipline: updatedRole.engineering_discipline,
        is_active: updatedRole.is_active,
        is_system: false,
        users_count: usersCount,
        permissions: updatedRole.permissions || [],
        created_at: updatedRole.created_at,
        updated_at: updatedRole.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating role: ' + error.message
    });
  }
};

/**
 * Delete role (soft delete)
 * @route DELETE /api/admin/roles/:id
 * @access Super Admin only
 */
const deleteRole = async (req, res) => {
  try {
    const { role } = req.params;

    const roleData = await Role.findById(role);
    if (!roleData) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if role has users assigned
    const usersWithRole = await User.countDocuments({ role_ids: role });
    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role.`
      });
    }

    // Soft delete - set is_active to false
    roleData.is_active = false;
    await roleData.save();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      resource_type: 'role',
      resource_id: role,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        role_name: roleData.name
      }
    });

    res.status(200).json({
      success: true,
      message: 'Role deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting role: ' + error.message
    });
  }
};

/**
 * Get available permissions
 * @route GET /api/admin/roles/permissions/available
 * @access Super Admin only
 */
const getAvailablePermissions = async (req, res) => {
  try {
    // Define available permissions based on the Role model
    const availablePermissions = [
      {
        entity: 'org',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'sites',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'buildings',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'floors',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'tenants',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'documents',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'assets',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'vendors',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'customers',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'users',
        permissions: ['view', 'create', 'edit', 'delete']
      },
      {
        entity: 'analytics',
        permissions: ['view', 'create', 'edit', 'delete']
      }
    ];

    res.status(200).json({
      success: true,
      data: availablePermissions
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching permissions: ' + error.message
    });
  }
};

/**
 * Assign role to user
 * @route POST /api/admin/roles/assign
 * @access Super Admin only
 */
const assignRole = async (req, res) => {
  try {
    const { user_id, role_id } = req.body;

    // Validate required fields
    const validationErrors = {};
    
    if (!user_id) {
      validationErrors.user_id = ['The user id field is required.'];
    }
    
    if (!role_id) {
      validationErrors.role_id = ['The role id field is required.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Verify user exists
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify role exists
    const role = await Role.findById(role_id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if user already has this role
    if (user.role_ids.includes(role_id)) {
      return res.status(400).json({
        success: false,
        message: 'User already has this role assigned'
      });
    }

    // Add role to user
    user.role_ids.push(role_id);
    await user.save();

    // Log audit
    await AuditLog.create({
      action: 'assign_role',
      resource_type: 'user',
      resource_id: user_id,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        role_id: role_id,
        role_name: role.name,
        user_email: user.email
      }
    });

    res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
      data: {
        user_id: user_id,
        role_id: role_id,
        role_name: role.name
      }
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning role: ' + error.message
    });
  }
};

/**
 * Remove role from user
 * @route DELETE /api/admin/roles/remove
 * @access Super Admin only
 */
const removeRole = async (req, res) => {
  try {
    const { user_id, role_id } = req.body;

    // Validate required fields
    const validationErrors = {};
    
    if (!user_id) {
      validationErrors.user_id = ['The user id field is required.'];
    }
    
    if (!role_id) {
      validationErrors.role_id = ['The role id field is required.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Verify user exists
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify role exists
    const role = await Role.findById(role_id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if user has this role
    if (!user.role_ids.includes(role_id)) {
      return res.status(400).json({
        success: false,
        message: 'User does not have this role assigned'
      });
    }

    // Remove role from user
    user.role_ids = user.role_ids.filter(id => id.toString() !== role_id);
    await user.save();

    // Log audit
    await AuditLog.create({
      action: 'remove_role',
      resource_type: 'user',
      resource_id: user_id,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        role_id: role_id,
        role_name: role.name,
        user_email: user.email
      }
    });

    res.status(200).json({
      success: true,
      message: 'Role removed successfully',
      data: {
        user_id: user_id,
        role_id: role_id,
        role_name: role.name
      }
    });
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing role: ' + error.message
    });
  }
};

module.exports = {
  getAllRoles,
  createRole,
  getRoleById,
  updateRole,
  deleteRole,
  getAvailablePermissions,
  assignRole,
  removeRole
};