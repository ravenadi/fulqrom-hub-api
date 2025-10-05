const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

// Helper function to log audit entry
async function logAudit(logData, req) {
  try {
    const auditLog = new AuditLog({
      ...logData,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    });
    await auditLog.save();
  } catch (error) {
    console.error('Error logging audit:', error);
  }
}

// GET /api/users - Get all users with roles
router.get('/', async (req, res) => {
  try {

    const { page = 1, limit = 50, is_active, role_id, search } = req.query;

    // Build filter query
    let filterQuery = {};

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    if (role_id) {
      filterQuery.role_ids = role_id;
    }

    // Search by name or email
    if (search) {
      filterQuery.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch users with roles populated
    const [users, totalUsers] = await Promise.all([
      User.find(filterQuery)
        .populate('role_ids', 'name description permissions')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filterQuery)
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total: totalUsers,
      page: pageNum,
      pages: Math.ceil(totalUsers / limitNum),
      data: users
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(id)
      .populate('role_ids', 'name description permissions');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// POST /api/users - Create user
router.post('/', async (req, res) => {
  try {
    let {
      email,
      full_name,
      fullName,
      first_name,
      firstName,
      last_name,
      lastName,
      phone,
      role_ids,
      roleIds,
      is_active,
      isActive
    } = req.body;

    // Normalize camelCase to snake_case
    full_name = full_name || fullName;
    first_name = first_name || firstName;
    last_name = last_name || lastName;
    role_ids = role_ids || roleIds;
    is_active = is_active !== undefined ? is_active : isActive;

    // Validate required fields
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Handle both formats: full_name or first_name + last_name
    if (!full_name && (first_name || last_name)) {
      full_name = `${first_name || ''} ${last_name || ''}`.trim();
    }

    if (!full_name) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Validate role IDs if provided
    if (role_ids && role_ids.length > 0) {
      const validRoles = await Role.find({ _id: { $in: role_ids } });
      if (validRoles.length !== role_ids.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more role IDs are invalid'
        });
      }
    }

    // Create user
    const user = new User({
      email: email.toLowerCase().trim(),
      full_name: full_name.trim(),
      phone: phone?.trim(),
      role_ids: role_ids || [],
      is_active: is_active !== undefined ? is_active : true
    });

    await user.save();

    // Log audit
    await logAudit({
      action: 'create',
      resource_type: 'user',
      resource_id: user._id.toString(),
      resource_name: user.full_name,
      status: 'success'
    }, req);

    // Populate roles before returning
    await user.populate('role_ids', 'name description permissions');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });

  } catch (error) {
    console.error('Error creating user:', error);

    // Log audit failure
    await logAudit({
      action: 'create',
      resource_type: 'user',
      status: 'error',
      error_message: error.message
    }, req);

    res.status(400).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let {
      email,
      full_name,
      fullName,
      first_name,
      firstName,
      last_name,
      lastName,
      phone,
      role_ids,
      roleIds,
      is_active,
      isActive
    } = req.body;

    // Normalize camelCase to snake_case
    full_name = full_name || fullName;
    first_name = first_name || firstName;
    last_name = last_name || lastName;
    role_ids = role_ids || roleIds;
    is_active = is_active !== undefined ? is_active : isActive;

    // Handle both formats: full_name or first_name + last_name
    if (!full_name && (first_name || last_name)) {
      const combinedName = `${first_name || ''} ${last_name || ''}`.trim();
      if (combinedName) {
        full_name = combinedName;
      }
    }

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it conflicts
    if (email && email.toLowerCase().trim() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }

    // Validate role IDs if provided
    if (role_ids && role_ids.length > 0) {
      const validRoles = await Role.find({ _id: { $in: role_ids } });
      if (validRoles.length !== role_ids.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more role IDs are invalid'
        });
      }
    }

    // Update fields (only if provided)
    if (email) user.email = email.toLowerCase().trim();
    if (full_name) user.full_name = full_name.trim();
    if (phone !== undefined) user.phone = phone?.trim();
    if (role_ids !== undefined) user.role_ids = role_ids;
    if (is_active !== undefined) user.is_active = is_active;

    user.updated_at = new Date();
    await user.save();

    // Log audit
    await logAudit({
      action: 'update',
      resource_type: 'user',
      resource_id: user._id.toString(),
      resource_name: user.full_name,
      status: 'success'
    }, req);

    // Populate roles before returning
    await user.populate('role_ids', 'name description permissions');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });

  } catch (error) {
    console.error('Error updating user:', error);

    // Log audit failure
    await logAudit({
      action: 'update',
      resource_type: 'user',
      resource_id: id,
      status: 'error',
      error_message: error.message
    }, req);

    res.status(400).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deletion of demo user
    if (user.email === 'demo@fulqrom.com.au') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete demo user'
      });
    }

    const userName = user.full_name;
    await User.findByIdAndDelete(id);

    // Log audit
    await logAudit({
      action: 'delete',
      resource_type: 'user',
      resource_id: id,
      resource_name: userName,
      status: 'success'
    }, req);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting user:', error);

    // Log audit failure
    await logAudit({
      action: 'delete',
      resource_type: 'user',
      resource_id: id,
      status: 'error',
      error_message: error.message
    }, req);

    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

// POST /api/users/:id/deactivate - Deactivate user
router.post('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;
    const { deactivated_by } = req.body;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deactivation of demo user
    if (user.email === 'demo@fulqrom.com.au') {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate demo user'
      });
    }

    // Check if already deactivated
    if (!user.is_active) {
      return res.status(400).json({
        success: false,
        message: 'User is already deactivated'
      });
    }

    // Deactivate user
    user.is_active = false;
    user.deactivated_at = new Date();
    user.deactivated_by = deactivated_by || 'system';
    user.updated_at = new Date();
    await user.save();

    // Log audit
    await logAudit({
      action: 'deactivate',
      resource_type: 'user',
      resource_id: user._id.toString(),
      resource_name: user.full_name,
      user_id: deactivated_by,
      status: 'success'
    }, req);

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data: user
    });

  } catch (error) {
    console.error('Error deactivating user:', error);

    // Log audit failure
    await logAudit({
      action: 'deactivate',
      resource_type: 'user',
      resource_id: id,
      status: 'error',
      error_message: error.message
    }, req);

    res.status(500).json({
      success: false,
      message: 'Error deactivating user',
      error: error.message
    });
  }
});

// GET /api/users/:id/resource-access - Get user resource access
router.get('/:id/resource-access', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user_id: user._id,
      user_name: user.full_name,
      count: user.resource_access?.length || 0,
      data: user.resource_access || []
    });

  } catch (error) {
    console.error('Error fetching resource access:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resource access',
      error: error.message
    });
  }
});

// POST /api/users/resource-access - Assign resource access
router.post('/resource-access', async (req, res) => {
  try {
    const { user_id, resource_type, resource_id, resource_name, granted_by } = req.body;

    // Validate required fields
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required'
      });
    }

    if (!resource_type) {
      return res.status(400).json({
        success: false,
        message: 'resource_type is required'
      });
    }

    if (!resource_id) {
      return res.status(400).json({
        success: false,
        message: 'resource_id is required'
      });
    }

    // Validate ObjectId
    if (!user_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Find user
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if access already exists
    const existingAccess = user.resource_access?.find(
      ra => ra.resource_type === resource_type && ra.resource_id === resource_id
    );

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        message: 'Resource access already granted'
      });
    }

    // Add resource access
    user.resource_access = user.resource_access || [];
    user.resource_access.push({
      resource_type,
      resource_id,
      resource_name: resource_name || '',
      granted_at: new Date(),
      granted_by: granted_by || 'system'
    });

    user.updated_at = new Date();
    await user.save();

    // Log audit
    await logAudit({
      action: 'grant_access',
      resource_type: resource_type,
      resource_id: resource_id,
      resource_name: resource_name,
      user_id: granted_by,
      details: { target_user_id: user_id },
      status: 'success'
    }, req);

    res.status(200).json({
      success: true,
      message: 'Resource access granted successfully',
      data: user.resource_access[user.resource_access.length - 1]
    });

  } catch (error) {
    console.error('Error assigning resource access:', error);

    // Log audit failure
    await logAudit({
      action: 'grant_access',
      resource_type: req.body.resource_type,
      resource_id: req.body.resource_id,
      status: 'error',
      error_message: error.message
    }, req);

    res.status(400).json({
      success: false,
      message: 'Error assigning resource access',
      error: error.message
    });
  }
});

// DELETE /api/users/resource-access/:id - Remove resource access
router.delete('/resource-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id query parameter is required'
      });
    }

    // Validate ObjectId
    if (!user_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Find user
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find and remove resource access
    const accessIndex = user.resource_access?.findIndex(
      ra => ra._id.toString() === id
    );

    if (accessIndex === -1 || accessIndex === undefined) {
      return res.status(404).json({
        success: false,
        message: 'Resource access not found'
      });
    }

    const removedAccess = user.resource_access[accessIndex];
    user.resource_access.splice(accessIndex, 1);
    user.updated_at = new Date();
    await user.save();

    // Log audit
    await logAudit({
      action: 'revoke_access',
      resource_type: removedAccess.resource_type,
      resource_id: removedAccess.resource_id,
      resource_name: removedAccess.resource_name,
      details: { target_user_id: user_id },
      status: 'success'
    }, req);

    res.status(200).json({
      success: true,
      message: 'Resource access removed successfully'
    });

  } catch (error) {
    console.error('Error removing resource access:', error);

    // Log audit failure
    await logAudit({
      action: 'revoke_access',
      resource_type: 'unknown',
      resource_id: req.params.id,
      status: 'error',
      error_message: error.message
    }, req);

    res.status(500).json({
      success: false,
      message: 'Error removing resource access',
      error: error.message
    });
  }
});

// POST /api/users/audit-logs - Log audit entry
router.post('/audit-logs', async (req, res) => {
  try {
    const {
      user_id,
      user_email,
      user_name,
      action,
      resource_type,
      resource_id,
      resource_name,
      details,
      status
    } = req.body;

    // Validate required fields
    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'action is required'
      });
    }

    if (!resource_type) {
      return res.status(400).json({
        success: false,
        message: 'resource_type is required'
      });
    }

    // Create audit log
    const auditLog = new AuditLog({
      user_id,
      user_email,
      user_name,
      action,
      resource_type,
      resource_id,
      resource_name,
      details,
      status: status || 'success',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    });

    await auditLog.save();

    res.status(201).json({
      success: true,
      message: 'Audit log created successfully',
      data: auditLog
    });

  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating audit log',
      error: error.message
    });
  }
});

module.exports = router;
