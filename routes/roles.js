const express = require('express');
const LegacyRole = require('../models/Role');
const User = require('../models/User');
const {
  createAuth0Role,
  updateAuth0Role,
  deleteAuth0Role,
  getAuth0RoleByName
} = require('../services/auth0Service');

const router = express.Router();

// ===========================================
// LEGACY ROLES API - TO BE REMOVED IN FUTURE
// ===========================================
// This is the old roles API implementation.
// It will be replaced by the new roles API in routes/v2/roles.js
// TODO: Remove this file once migration to new roles API is complete
// ===========================================

// GET /api/roles - Get all roles with user counts
router.get('/', async (req, res) => {
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
      LegacyRole.find(filterQuery)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      LegacyRole.countDocuments(filterQuery)
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
      count: rolesWithCounts.length,
      total: totalRoles,
      page: pageNum,
      pages: Math.ceil(totalRoles / limitNum),
      data: rolesWithCounts
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: error.message
    });
  }
});

// GET /api/roles/:id - Get role by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role ID format'
      });
    }

    const role = await LegacyRole.findById(id);

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
      data: {
        ...role.toObject(),
        user_count: userCount
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching role',
      error: error.message
    });
  }
});

// POST /api/roles - Create role
router.post('/', async (req, res) => {
  try {
    const { name, description, is_active, permissions } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    // Check if role name already exists
    const existingRole = await LegacyRole.findOne({ name: name.trim() });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists'
      });
    }

    // Create role
    const role = new LegacyRole({
      name: name.trim(),
      description: description?.trim(),
      is_active: is_active !== undefined ? is_active : true,
      permissions: permissions || []
    });

    await role.save();

    // Create role in Auth0
    let auth0Role = null;
    try {
      auth0Role = await createAuth0Role({
        name: role.name,
        description: role.description
      });

      // Store Auth0 role ID in MongoDB
      if (auth0Role) {
        role.auth0_id = auth0Role.id;
        await role.save();
      }
    } catch (auth0Error) {
      console.error('Auth0 role creation failed:', auth0Error.message);
      // Continue even if Auth0 creation fails - role exists in MongoDB
    }

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role,
      auth0_synced: !!auth0Role
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error creating role',
      error: error.message
    });
  }
});

// PUT /api/roles/:id - Update role
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active, permissions } = req.body;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role ID format'
      });
    }

    // Check if role exists
    const role = await LegacyRole.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if new name conflicts with existing role
    if (name && name.trim() !== role.name) {
      const existingRole = await LegacyRole.findOne({ name: name.trim() });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role with this name already exists'
        });
      }
    }

    // Prepare update data for Auth0
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();

    // Update fields
    if (name) role.name = name.trim();
    if (description !== undefined) role.description = description?.trim();
    if (is_active !== undefined) role.is_active = is_active;
    if (permissions) role.permissions = permissions;

    role.updated_at = new Date();
    await role.save();

    // Update role in Auth0 (if auth0_id exists)
    let auth0Updated = false;
    if (role.auth0_id) {
      try {
        await updateAuth0Role(role.auth0_id, updateData);
        auth0Updated = true;
      } catch (auth0Error) {
        console.error('Auth0 role update failed:', auth0Error.message);
        // Continue even if Auth0 update fails - role updated in MongoDB
      }
    }

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: role,
      auth0_synced: auth0Updated
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error updating role',
      error: error.message
    });
  }
});

// DELETE /api/roles/:id - Delete role
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role ID format'
      });
    }

    // Check if role exists
    const role = await LegacyRole.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Prevent deletion of Site Manager role
    if (role.name === 'Site Manager') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete Site Manager role'
      });
    }

    // Check if role is assigned to any users
    const userCount = await User.countDocuments({ role_ids: role._id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${userCount} user(s). Please reassign users first.`
      });
    }

    const roleName = role.name;
    const auth0Id = role.auth0_id;

    // Delete from MongoDB
    await LegacyRole.findByIdAndDelete(id);

    // Delete from Auth0 (if auth0_id exists)
    let auth0Deleted = false;
    if (auth0Id) {
      try {
        await deleteAuth0Role(auth0Id);
        auth0Deleted = true;
      } catch (auth0Error) {
        console.error('Auth0 role deletion failed:', auth0Error.message);
        // Continue even if Auth0 deletion fails - role deleted from MongoDB
      }
    }

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully',
      auth0_synced: auth0Deleted
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error deleting role',
      error: error.message
    });
  }
});

// GET /api/roles/:id/users - Get users by role
router.get('/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role ID format'
      });
    }

    // Check if role exists
    const role = await LegacyRole.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Find users with this role
    const [users, totalUsers] = await Promise.all([
      User.find({ role_ids: id })
        .populate('role_ids', 'name description')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments({ role_ids: id })
    ]);

    res.status(200).json({
      success: true,
      role: {
        _id: role._id,
        name: role.name,
        description: role.description
      },
      count: users.length,
      total: totalUsers,
      page: pageNum,
      pages: Math.ceil(totalUsers / limitNum),
      data: users
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching users by role',
      error: error.message
    });
  }
});

module.exports = router;
