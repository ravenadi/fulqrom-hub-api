/**
 * User Controller
 * Handles business logic for user CRUD operations.
 *
 * @module controllers/userController
 */

const User = require('../models/User');
const Role = require('../models/Role');
const auth0Service = require('../services/auth0Service');
const tenantRestrictionService = require('../services/tenantRestrictionService');
const emailService = require('../utils/emailService');

// Valid resource types for resource_access validation
const VALID_RESOURCE_TYPES = [
  'org', 'site', 'building', 'floor', 'tenant', 'document',
  'asset', 'vendor', 'customer', 'user', 'analytics',
  'document_category', 'document_discipline'
];

/**
 * List all users with filtering and pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const list = async (req, res) => {
  try {
    const { page = 1, limit = 50, is_active, role_id, search } = req.query;

    // Build filter query
    let filterQuery = {};

    // CRITICAL: Filter by tenant for multi-tenant data isolation
    if (req.tenant && req.tenant.tenantId && !req.tenant.bypassTenant) {
      filterQuery.tenant_id = req.tenant.tenantId;
    }

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
      data: users.map(u => ({
        ...u,
        mfa_required: u.mfa_required ?? false
      }))
    });

  } catch (error) {
    console.error('Error in userController.list:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

/**
 * Get user by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getById = async (req, res) => {
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

    const userObject = user.toObject();

    res.status(200).json({
      success: true,
      data: {
        ...userObject,
        role_name: user.role_ids && user.role_ids.length > 0 ? user.role_ids[0].name : 'User',
        mfa_required: userObject.mfa_required ?? false
      }
    });

  } catch (error) {
    console.error('Error in userController.getById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

/**
 * Get current authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMe = async (req, res) => {
  // TODO: Migrate from routes/users.js if exists
  throw new Error('Not implemented - migrate from routes/users.js');
};

/**
 * Create new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const create = async (req, res) => {
  let createdUser = null;

  try {
    // Normalize input
    const input = normalizeUserInput(req.body);
    let { email, full_name, first_name, last_name, phone, password, role_ids, is_active,
          resource_access, document_categories, engineering_disciplines, send_invite_email } = input;

    // Handle both formats: full_name or first_name + last_name
    if (!full_name && (first_name || last_name)) {
      full_name = `${first_name || ''} ${last_name || ''}`.trim();
    }

    // Validate required fields
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if user already exists in Auth0
    try {
      const existingAuth0User = await auth0Service.getAuth0UserByEmail(email.toLowerCase().trim());
      if (existingAuth0User) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists in Auth0. Please contact support.',
          auth0_user_id: existingAuth0User.user_id
        });
      }
    } catch (auth0CheckError) {
      console.error('Error checking Auth0 for existing user:', auth0CheckError.message);
    }

    // Filter out empty strings from role_ids
    if (role_ids !== undefined) {
      role_ids = role_ids.filter(id => id && id.trim() !== '');
    }

    // Role is required
    if (!role_ids || role_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    // Validate role IDs
    const validRoles = await Role.find({ _id: { $in: role_ids } });
    if (validRoles.length !== role_ids.length) {
      return res.status(400).json({ success: false, message: 'One or more role IDs are invalid' });
    }

    // Check user limit for tenant
    if (req.tenant?.tenantId) {
      try {
        await tenantRestrictionService.checkCanCreateUser(req.tenant.tenantId);
      } catch (limitError) {
        const plan = await tenantRestrictionService.getTenantPlan(req.tenant.tenantId);
        const currentUsers = await User.countDocuments({ tenant_id: req.tenant.tenantId });
        return res.status(403).json({
          success: false,
          error: 'USER_LIMIT_REACHED',
          message: limitError.message,
          limit: plan?.max_users || 0,
          current: currentUsers,
          unit: 'users'
        });
      }
    }

    // Validate resource_access if provided
    if (resource_access !== undefined) {
      const validation = validateResourceAccess(resource_access);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Validate document_categories if provided
    if (document_categories !== undefined) {
      const validation = validateStringArray(document_categories, 'document_categories');
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Validate engineering_disciplines if provided
    if (engineering_disciplines !== undefined) {
      const validation = validateStringArray(engineering_disciplines, 'engineering_disciplines');
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Create user data
    const userData = {
      email: email.toLowerCase().trim(),
      full_name: full_name.trim(),
      phone: phone?.trim(),
      role_ids: role_ids || [],
      is_active: is_active !== undefined ? is_active : true,
      tenant_id: req.tenant?.tenantId
    };

    if (resource_access !== undefined) {
      userData.resource_access = resource_access.map(access => ({ ...access, granted_at: new Date() }));
    }
    if (document_categories !== undefined) {
      userData.document_categories = document_categories.map(c => c.trim()).filter(c => c.length > 0);
    }
    if (engineering_disciplines !== undefined) {
      userData.engineering_disciplines = engineering_disciplines.map(d => d.trim()).filter(d => d.length > 0);
    }

    const user = new User(userData);
    await user.save();
    createdUser = user;

    // Create user in Auth0
    const auth0User = await auth0Service.ensureAuth0User({
      _id: user._id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      password: password,
      is_active: user.is_active,
      role_ids: user.role_ids,
      mfa_required: true
    });

    if (!auth0User || !auth0User.user_id) {
      throw new Error('Failed to create user in Auth0 - no user ID returned');
    }

    user.auth0_id = auth0User.user_id;
    await user.save();

    // Send invite email if requested
    let inviteSent = false;
    let inviteError = null;

    if (send_invite_email && password) {
      try {
        const emailResult = await emailService.sendUserInvite({
          to: user.email,
          userName: user.full_name,
          userEmail: user.email,
          password: password
        });
        inviteSent = emailResult.success;
        if (!emailResult.success) inviteError = emailResult.error || 'Failed to send email';
      } catch (inviteErr) {
        inviteError = inviteErr.message;
      }
    } else if (send_invite_email && !password) {
      inviteError = 'Password is required to send invite email with credentials';
    }

    await user.populate('role_ids', 'name description permissions');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
      auth0_synced: true,
      invite_sent: inviteSent,
      invite_error: inviteError
    });

  } catch (error) {
    console.error('Error in userController.create:', error);

    // Rollback: delete MongoDB user if created
    if (createdUser && createdUser._id) {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.log(`Rolled back MongoDB user creation after Auth0 failure: ${createdUser.email}`);
      } catch (deleteError) {
        console.error('Failed to rollback user creation:', deleteError);
      }
    }

    let errorMessage = 'Error creating user';
    let statusCode = 400;

    if (error.message.includes('PasswordStrengthError') || error.message.includes('Password is too weak')) {
      errorMessage = 'Password is too weak. Please use a stronger password.';
    } else if (error.statusCode === 409 || error.message.includes('already exists')) {
      errorMessage = 'User with this email already exists';
      statusCode = 409;
    } else {
      errorMessage = error.message || 'Error creating user';
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

/**
 * Update user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const update = async (req, res) => {
  const { id } = req.params;

  try {
    // Normalize input
    const input = normalizeUserInput(req.body);
    let { email, full_name, first_name, last_name, phone, password, role_ids, is_active,
          mfa_required, resource_access, replace_resource_access, document_categories,
          engineering_disciplines, send_invite_email } = input;

    // Handle both formats: full_name or first_name + last_name
    if (!full_name && (first_name || last_name)) {
      const combinedName = `${first_name || ''} ${last_name || ''}`.trim();
      if (combinedName) full_name = combinedName;
    }

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if email is being changed and if it conflicts
    if (email && email.toLowerCase().trim() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
    }

    // Filter out empty strings from role_ids
    if (role_ids !== undefined) {
      role_ids = role_ids.filter(id => id && id.trim() !== '');
    }

    // Role is required if being updated
    if (role_ids !== undefined && role_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    // Validate role IDs if provided
    if (role_ids && role_ids.length > 0) {
      const validRoles = await Role.find({ _id: { $in: role_ids } });
      if (validRoles.length !== role_ids.length) {
        return res.status(400).json({ success: false, message: 'One or more role IDs are invalid' });
      }
    }

    // Validate resource_access if provided
    if (resource_access !== undefined) {
      const validation = validateResourceAccess(resource_access);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Validate document_categories if provided
    if (document_categories !== undefined) {
      const validation = validateStringArray(document_categories, 'document_categories');
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Validate engineering_disciplines if provided
    if (engineering_disciplines !== undefined) {
      const validation = validateStringArray(engineering_disciplines, 'engineering_disciplines');
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
    }

    // Prepare update data for Auth0
    const updateData = {};
    if (email) updateData.email = email.toLowerCase().trim();
    if (full_name) updateData.full_name = full_name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim();
    if (role_ids !== undefined) updateData.role_ids = role_ids;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Update MongoDB user
    if (email) user.email = email.toLowerCase().trim();
    if (full_name) user.full_name = full_name.trim();
    if (phone !== undefined) user.phone = phone?.trim();
    if (role_ids !== undefined) user.role_ids = role_ids;
    if (is_active !== undefined) user.is_active = is_active;
    if (mfa_required !== undefined) user.mfa_required = mfa_required;

    // Handle resource_access update
    if (resource_access !== undefined) {
      if (replace_resource_access === true) {
        user.resource_access = resource_access.map(access => ({ ...access, granted_at: new Date() }));
      } else {
        const newAccess = resource_access.map(access => ({ ...access, granted_at: new Date() }));
        user.resource_access = [...(user.resource_access || []), ...newAccess];
      }
    }

    // Handle document_categories update
    if (document_categories !== undefined) {
      user.document_categories = document_categories.map(c => c.trim()).filter(c => c.length > 0);
    }

    // Handle engineering_disciplines update
    if (engineering_disciplines !== undefined) {
      user.engineering_disciplines = engineering_disciplines.map(d => d.trim()).filter(d => d.length > 0);
    }

    user.updated_at = new Date();
    await user.save();

    // Update password in Auth0 if provided
    let passwordUpdated = false;
    let inviteEmailSent = false;
    let inviteEmailError = null;

    if (password) {
      if (!user.auth0_id) {
        try {
          const auth0User = await auth0Service.ensureAuth0User({
            _id: user._id,
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            password: password,
            is_active: user.is_active,
            role_ids: user.role_ids || []
          });
          if (auth0User) {
            user.auth0_id = auth0User.user_id;
            await user.save();
            passwordUpdated = true;
          }
        } catch (auth0CreateError) {
          console.error('Failed to create Auth0 user with password:', auth0CreateError.message);
        }
      } else {
        try {
          await auth0Service.setAuth0Password(user.auth0_id, password);
          passwordUpdated = true;
        } catch (passwordError) {
          console.error('Failed to update password in Auth0:', passwordError.message);
        }
      }

      // Send invite email if requested and password was updated
      if (passwordUpdated && send_invite_email === true) {
        try {
          const emailResult = await emailService.sendUserInvite({
            to: user.email,
            userName: user.full_name,
            userEmail: user.email,
            password: password
          });
          inviteEmailSent = emailResult.success;
          if (!emailResult.success) inviteEmailError = emailResult.error || 'Unknown error sending email';
        } catch (emailError) {
          inviteEmailError = emailError.message;
        }
      }
    }

    // Update user in Auth0
    let auth0Updated = false;
    let rolesSynced = false;

    if (user.auth0_id) {
      try {
        await auth0Service.updateAuth0User(user.auth0_id, updateData);
        auth0Updated = true;

        if (role_ids !== undefined) {
          try {
            await auth0Service.syncUserRoles(user.auth0_id, role_ids);
            rolesSynced = true;
          } catch (roleSyncError) {
            console.error('Auth0 role sync failed:', roleSyncError.message);
          }
        }
      } catch (auth0Error) {
        console.error('Auth0 user update failed:', auth0Error.message);
      }
    }

    await user.populate('role_ids', 'name description permissions');

    // Build response message
    let message = 'User updated successfully';
    if (password && !passwordUpdated) {
      message = 'User updated successfully, but password update failed';
    } else if (password && passwordUpdated) {
      if (inviteEmailSent) {
        message = 'User updated successfully, password updated and invite email sent';
      } else if (send_invite_email && inviteEmailError) {
        message = 'User updated successfully, password updated but invite email failed';
      } else {
        message = 'User updated successfully, password updated in Auth0';
      }
    }

    res.status(200).json({
      success: true,
      message: message,
      data: user,
      auth0_synced: auth0Updated,
      roles_synced: rolesSynced,
      password_updated: passwordUpdated,
      invite_sent: inviteEmailSent,
      invite_error: inviteEmailError
    });

  } catch (error) {
    console.error('Error in userController.update:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

/**
 * Delete user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deletion of demo user
    if (user.email === 'demo@fulqrom.com.au') {
      return res.status(400).json({ success: false, message: 'Cannot delete demo user' });
    }

    const auth0Id = user.auth0_id;

    // Delete from Auth0 FIRST (if auth0_id exists)
    let auth0Deleted = false;
    if (auth0Id) {
      try {
        const auth0IdString = typeof auth0Id === 'string' ? auth0Id : String(auth0Id);
        await auth0Service.deleteAuth0User(auth0IdString);
        auth0Deleted = true;
        console.log(`Deleted user from Auth0: ${auth0IdString}`);
      } catch (auth0Error) {
        console.error('Auth0 user deletion failed:', auth0Error.message);

        // Check for specific Auth0 errors
        if (auth0Error.message.includes('404') || auth0Error.message.includes('not found')) {
          // User doesn't exist in Auth0, proceed with MongoDB deletion
          console.log('User not found in Auth0, proceeding with MongoDB deletion');
          auth0Deleted = false;
        } else if (auth0Error.message.includes('invalid_uri') || auth0Error.message.includes("didn't pass validation")) {
          return res.status(500).json({
            success: false,
            message: `Invalid Auth0 user ID format. The user may have corrupted data.`,
            error: auth0Error.message,
            auth0_synced: false
          });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to delete user from Auth0. User not deleted from database.',
            error: auth0Error.message,
            auth0_synced: false
          });
        }
      }
    } else {
      console.log('User has no auth0_id, skipping Auth0 deletion');
    }

    // Delete from MongoDB after Auth0 deletion succeeds
    await User.findByIdAndDelete(id);
    console.log(`Deleted user from MongoDB: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      auth0_synced: auth0Deleted
    });

  } catch (error) {
    console.error('Error in userController.remove:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

/**
 * Update user password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updatePassword = async (req, res) => {
  // TODO: Migrate from routes/users.js if exists as separate endpoint
  throw new Error('Not implemented - migrate from routes/users.js');
};

/**
 * Get accessible resources for a user (for assignment)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAccessibleResources = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { resource_type } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Import authorization rules dynamically to get accessible resources
    const { getAccessibleResources: getResources } = require('../middleware/authorizationRules');
    const accessibleResources = await getResources(userId, resource_type);

    res.json({
      success: true,
      data: accessibleResources
    });

  } catch (error) {
    console.error('Error getting accessible resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting accessible resources',
      error: error.message
    });
  }
};

/**
 * Resend invite email to user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const resendInvite = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Get user from database
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Send invite email
    try {
      console.log(`Resending invite email to: ${user.email}`);

      // Generate a new temporary password
      const temporaryPassword = generateRandomPassword(14);

      // Update password in Auth0
      if (user.auth0_id) {
        try {
          console.log(`Setting new password in Auth0 for user: ${user.auth0_id}`);
          await auth0Service.setAuth0Password(user.auth0_id, temporaryPassword);
          console.log(`Password updated in Auth0`);
        } catch (auth0Error) {
          console.error(`Failed to update Auth0 password: ${auth0Error.message}`);
          throw new Error(`Failed to set password in Auth0: ${auth0Error.message}`);
        }
      } else {
        throw new Error('User does not have Auth0 ID. Cannot resend invite.');
      }

      // Send email with new credentials
      const emailResult = await emailService.sendUserInvite({
        to: user.email,
        userName: user.full_name,
        userEmail: user.email,
        password: temporaryPassword
      });

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Failed to send email');
      }

      console.log(`Invite email resent successfully to: ${user.email}`);

      res.status(200).json({
        success: true,
        message: 'Invite email sent successfully with new credentials',
        invite_sent: true,
        messageId: emailResult.messageId
      });
    } catch (inviteError) {
      console.error(`Failed to send invite email to ${user.email}:`, inviteError.message);

      res.status(500).json({
        success: false,
        message: 'Failed to send invite email',
        error: inviteError.message,
        invite_sent: false
      });
    }

  } catch (error) {
    console.error('Error resending invite:', error);
    res.status(500).json({
      success: false,
      message: 'Error resending invite email',
      error: error.message
    });
  }
};

/**
 * Deactivate user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deactivate = async (req, res) => {
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

    // Block user in Auth0 (if auth0_id exists)
    let auth0Updated = false;
    if (user.auth0_id) {
      try {
        await auth0Service.updateAuth0User(user.auth0_id, { is_active: false });
        auth0Updated = true;
      } catch (auth0Error) {
        console.error('Auth0 user block failed:', auth0Error.message);
        // Continue even if Auth0 update fails - user deactivated in MongoDB
      }
    }

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data: user,
      auth0_synced: auth0Updated
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deactivating user',
      error: error.message
    });
  }
};

/**
 * Reset MFA for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const resetMfa = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }
    // Find and update user
    const user = await User.findByIdAndUpdate(id, { mfa_required: false }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    // TODO: Remove enrolled factors via Auth0 Management API if connected
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error resetting MFA', error: error.message });
  }
};

/**
 * Get user resource access
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getResourceAccess = async (req, res) => {
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
    res.status(500).json({
      success: false,
      message: 'Error fetching resource access',
      error: error.message
    });
  }
};

/**
 * Assign resource access to a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const assignResourceAccess = async (req, res) => {
  try {
    const { user_id, resource_type, resource_id, resource_name, granted_by, permissions } = req.body;

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

    // Validate resource_type
    const validResourceTypes = ['customer', 'site', 'building', 'floor', 'asset', 'tenant', 'vendor', 'document_category', 'document_discipline'];
    if (!validResourceTypes.includes(resource_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid resource_type. Must be one of: ${validResourceTypes.join(', ')}`
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
        message: 'Resource access already granted. Use PUT to update permissions.'
      });
    }

    // Default permissions if not provided (view-only by default)
    const resourcePermissions = permissions || {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false
    };

    // Add resource access with permissions
    user.resource_access = user.resource_access || [];
    user.resource_access.push({
      resource_type,
      resource_id,
      resource_name: resource_name || '',
      permissions: resourcePermissions,
      granted_at: new Date(),
      granted_by: granted_by || 'system'
    });

    user.updated_at = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Resource access granted successfully',
      data: user.resource_access[user.resource_access.length - 1]
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error assigning resource access',
      error: error.message
    });
  }
};

/**
 * Remove resource access from a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const removeResourceAccess = async (req, res) => {
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

    user.resource_access.splice(accessIndex, 1);
    user.updated_at = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Resource access removed successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing resource access',
      error: error.message
    });
  }
};

// ============ Private Helper Functions ============

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 12)
 * @returns {string} - Random password
 * @private
 */
function generateRandomPassword(length = 12) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';

  const all = uppercase + lowercase + numbers + symbols;

  let password = '';
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Normalize input from camelCase to snake_case
 * @param {Object} body - Request body
 * @returns {Object} - Normalized body
 * @private
 */
function normalizeUserInput(body) {
  return {
    email: body.email,
    full_name: body.full_name || body.fullName,
    first_name: body.first_name || body.firstName,
    last_name: body.last_name || body.lastName,
    phone: body.phone,
    password: body.password,
    role_ids: body.role_ids || body.roleIds,
    is_active: body.is_active !== undefined ? body.is_active : body.isActive,
    mfa_required: body.mfa_required !== undefined ? body.mfa_required : body.mfaRequired,
    resource_access: body.resource_access,
    replace_resource_access: body.replace_resource_access,
    document_categories: body.document_categories,
    engineering_disciplines: body.engineering_disciplines,
    send_invite_email: body.send_invite_email !== undefined ? body.send_invite_email : body.sendInviteEmail
  };
}

/**
 * Validate resource_access array
 * @param {Array} resourceAccess - Resource access array
 * @returns {Object} - { valid: boolean, error: string|null }
 * @private
 */
function validateResourceAccess(resourceAccess) {
  if (!Array.isArray(resourceAccess)) {
    return { valid: false, error: 'resource_access must be an array' };
  }

  for (const access of resourceAccess) {
    if (!access.resource_type || !VALID_RESOURCE_TYPES.includes(access.resource_type)) {
      return {
        valid: false,
        error: `Invalid resource_type: ${access.resource_type}. Must be one of: ${VALID_RESOURCE_TYPES.join(', ')}`
      };
    }

    if (!access.resource_id || typeof access.resource_id !== 'string') {
      return { valid: false, error: 'resource_id is required and must be a string' };
    }

    if (!access.permissions || typeof access.permissions !== 'object') {
      return { valid: false, error: 'permissions object is required' };
    }

    const requiredPermissions = ['can_view', 'can_create', 'can_edit', 'can_delete'];
    for (const perm of requiredPermissions) {
      if (typeof access.permissions[perm] !== 'boolean') {
        return { valid: false, error: `permissions.${perm} must be a boolean` };
      }
    }
  }

  return { valid: true, error: null };
}

/**
 * Validate string array (for document_categories, engineering_disciplines)
 * @param {Array} arr - Array to validate
 * @param {string} fieldName - Field name for error message
 * @returns {Object} - { valid: boolean, error: string|null }
 * @private
 */
function validateStringArray(arr, fieldName) {
  if (!Array.isArray(arr)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }

  for (const item of arr) {
    if (typeof item !== 'string') {
      return { valid: false, error: `Each ${fieldName} must be a string` };
    }
  }

  return { valid: true, error: null };
}

module.exports = {
  list,
  getById,
  getMe,
  create,
  update,
  remove,
  updatePassword,
  getAccessibleResources,
  resendInvite,
  deactivate,
  resetMfa,
  getResourceAccess,
  assignResourceAccess,
  removeResourceAccess,
  // Export helpers for potential reuse
  generateRandomPassword,
  normalizeUserInput,
  validateResourceAccess,
  validateStringArray,
  VALID_RESOURCE_TYPES
};
