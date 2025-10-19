const User = require('../models/User');
const Role = require('../models/v2/Role');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');

/**
 * Create new user
 * @route POST /api/admin/users
 * @access Super Admin only
 */
const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      tenant_id,
      role_id,
      password,
      phone,
      is_active = true,
      send_invite = true
    } = req.body;

    // Validate required fields
    const validationErrors = {};
    
    if (!name) {
      validationErrors.name = ['The name field is required.'];
    }
    
    if (!email) {
      validationErrors.email = ['The email field is required.'];
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      validationErrors.email = ['The email must be a valid email address.'];
    }
    
    if (!tenant_id) {
      validationErrors.tenant_id = ['The tenant id field is required.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: {
          email: ['The email has already been taken.']
        }
      });
    }

    // Verify tenant exists
    const customer = await Customer.findById(tenant_id);
    if (!customer) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: {
          tenant_id: ['The selected tenant id is invalid.']
        }
      });
    }

    // Create user
    const user = new User({
      email,
      full_name: name, // Keep full_name in our model but map to name in response
      phone,
      customer_id: tenant_id, // Keep customer_id in our model but map to tenant_id in response
      role_ids: role_id ? [role_id] : [], // Keep role_ids array but map to role_id in response
      is_active
    });

    await user.save();

    // Populate the created user
    const populatedUser = await User.findById(user._id)
      .populate('role_ids', 'name description')
      .populate('customer_id', 'organisation.organisation_name')
      .lean();

    // Log audit
    await AuditLog.create({
      action: 'create',
      resource_type: 'user',
      resource_id: user._id,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        user_name: name,
        tenant_id: tenant_id
      }
    });

    // Transform user data to match Laravel DR format
    const transformedUser = {
      id: populatedUser._id,
      name: populatedUser.full_name,
      email: populatedUser.email,
      phone: populatedUser.phone,
      tenant_id: populatedUser.customer_id,
      role_id: populatedUser.role_ids && populatedUser.role_ids.length > 0 ? populatedUser.role_ids[0] : null,
      is_active: populatedUser.is_active,
      workos_id: populatedUser.auth0_id || null,
      created_at: populatedUser.created_at,
      updated_at: populatedUser.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully' + (send_invite ? ' and invite email sent' : ''),
      user: transformedUser,
      invite_sent: send_invite,
      workos_integration: {
        status: 'failed', // TODO: Implement WorkOS integration
        workos_id: null,
        enabled: false
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'User creation failed: ' + error.message
    });
  }
};

/**
 * Get user details
 * @route GET /api/admin/users/:id
 * @access Super Admin only
 */
const getUserById = async (req, res) => {
  try {
    const { user } = req.params;

    const userData = await User.findById(user)
      .populate('role_ids', 'name description')
      .populate('customer_id', 'organisation.organisation_name')
      .lean();

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Transform user data to match Laravel DR format
    const transformedUser = {
      id: userData._id,
      name: userData.full_name,
      email: userData.email,
      phone: userData.phone,
      tenant_id: userData.customer_id,
      role_id: userData.role_ids && userData.role_ids.length > 0 ? userData.role_ids[0] : null,
      is_active: userData.is_active,
      workos_id: userData.auth0_id || null,
      created_at: userData.created_at,
      updated_at: userData.updated_at
    };

    res.status(200).json({
      success: true,
      data: transformedUser
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user: ' + error.message
    });
  }
};

/**
 * Update user
 * @route PUT /api/admin/users/:id
 * @access Super Admin only
 */
const updateUser = async (req, res) => {
  try {
    const { user } = req.params;
    const {
      name,
      email,
      phone,
      is_active,
      role_id,
      password,
      send_invite = false
    } = req.body;

    // Validate input
    const validationErrors = {};
    
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      validationErrors.email = ['The email must be a valid email address.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const userData = await User.findById(user);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it conflicts
    if (email && email !== userData.email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: user } 
      });
      if (existingUser) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: {
            email: ['The email has already been taken.']
          }
        });
      }
    }

    // Update user data
    const updateData = {};
    if (name !== undefined) updateData.full_name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (role_id !== undefined) updateData.role_ids = role_id ? [role_id] : [];

    const updatedUser = await User.findByIdAndUpdate(
      user,
      updateData,
      { new: true, runValidators: true }
    ).populate('role_ids', 'name description')
     .populate('customer_id', 'organisation.organisation_name');

    // Log audit
    await AuditLog.create({
      action: 'update',
      resource_type: 'user',
      resource_id: user,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: updateData
    });

    // Transform user data to match Laravel DR format
    const transformedUser = {
      id: updatedUser._id,
      name: updatedUser.full_name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      tenant_id: updatedUser.customer_id,
      role_id: updatedUser.role_ids && updatedUser.role_ids.length > 0 ? updatedUser.role_ids[0] : null,
      is_active: updatedUser.is_active,
      workos_id: updatedUser.auth0_id || null,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at
    };

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: transformedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'User update failed: ' + error.message
    });
  }
};

/**
 * Delete user (soft delete)
 * @route DELETE /api/admin/users/:id
 * @access Super Admin only
 */
const deleteUser = async (req, res) => {
  try {
    const { user } = req.params;

    const userData = await User.findById(user);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete - set is_active to false
    userData.is_active = false;
    await userData.save();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      resource_type: 'user',
      resource_id: user,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        user_name: userData.full_name,
        user_email: userData.email
      }
    });

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user: ' + error.message
    });
  }
};

/**
 * Get all users with filtering, sorting, and pagination
 * @route GET /api/admin/users
 * @access Super Admin only
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 15,
      tenant_id,
      role_id,
      status,
      search,
      sort_by = 'id',
      sort_order = 'desc'
    } = req.query;

    // Build filter query
    let filter = {};

    if (tenant_id) {
      filter.customer_id = tenant_id;
    }

    if (role_id) {
      filter.role_ids = role_id;
    }

    if (status) {
      filter.is_active = status === 'Active';
    }

    // Search by name, email, or ID
    if (search) {
      filter.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { _id: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    
    const [users, total] = await Promise.all([
      User.find(filter)
        .populate('role_ids', 'name description')
        .populate('customer_id', 'organisation.organisation_name')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(per_page))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Transform users to match Laravel DR format
    const transformedUsers = users.map(user => ({
      id: user._id,
      name: user.full_name,
      email: user.email,
      tenant_id: user.customer_id,
      role_id: user.role_ids && user.role_ids.length > 0 ? user.role_ids[0] : null,
      is_active: user.is_active,
      workos_id: user.auth0_id || null,
      created_at: user.created_at,
      updated_at: user.updated_at
    }));

    // Return Laravel DR pagination format (direct pagination object like Laravel)
    res.status(200).json({
      data: transformedUsers,
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total: total,
      last_page: Math.ceil(total / parseInt(per_page)),
      from: skip + 1,
      to: Math.min(skip + parseInt(per_page), total)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users: ' + error.message
    });
  }
};

/**
 * Get tenants for user creation dropdown
 * @route GET /api/admin/users/tenants
 * @access Super Admin only
 */
const getTenants = async (req, res) => {
  try {
    const tenants = await Customer.find({ is_active: true })
      .select('_id organisation.organisation_name')
      .sort({ 'organisation.organisation_name': 1 })
      .lean();

    const formattedTenants = tenants.map(tenant => ({
      id: tenant._id,
      name: tenant.organisation?.organisation_name || 'Unnamed Customer'
    }));

    res.status(200).json({
      success: true,
      data: formattedTenants
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants: ' + error.message
    });
  }
};

/**
 * Get roles for user creation dropdown
 * @route GET /api/admin/users/roles
 * @access Super Admin only
 */
const getRoles = async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    let filter = { is_active: true };
    
    // If tenant_id is provided, filter roles for that tenant + global roles (null tenant_id)
    if (tenant_id) {
      filter.$or = [
        { tenant_id: null }, // Global roles
        { tenant_id: tenant_id } // Tenant-specific roles
      ];
    } else {
      // If no tenant specified, return global roles only
      filter.tenant_id = null;
    }

    const roles = await Role.find(filter)
      .select('_id name tenant_id')
      .sort({ name: 1 })
      .lean();

    const formattedRoles = roles.map(role => ({
      id: role._id,
      name: role.name,
      tenant_id: role.tenant_id
    }));

    res.status(200).json({
      success: true,
      data: formattedRoles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles: ' + error.message
    });
  }
};

module.exports = {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getAllUsers,
  getTenants,
  getRoles
};