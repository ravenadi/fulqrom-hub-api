const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');
const {
  getAuth0Client,
  createAuth0User,
  updateAuth0User,
  deleteAuth0User,
  getAuth0UserByEmail,
  ensureAuth0User,
  syncUserRoles,
  setAuth0Password,
  sendInviteEmail
} = require('../services/auth0Service');
const { validateUserCreation, validateUserElevation, getAccessibleResources } = require('../middleware/authorizationRules');
const { checkModulePermission } = require('../middleware/checkPermission');
const emailService = require('../utils/emailService');

const router = express.Router();

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 12)
 * @returns {string} - Random password
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

// GET /api/users/:id/accessible-resources - Get resources accessible to user for assignment (Rule 1)
router.get('/:id/accessible-resources', async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { resource_type } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const accessibleResources = await getAccessibleResources(userId, resource_type);

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
});

// GET /api/users - Get all users with roles
router.get('/', async (req, res) => {
  try {

    const { page = 1, limit = 50, is_active, role_id, search } = req.query;

    // Build filter query
    let filterQuery = {};

    // CRITICAL: Filter by tenant for multi-tenant data isolation
    // Only show users from the current tenant unless user is super admin bypassing tenant
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
        mfa_required: u.mfa_required ?? false,
        // TODO: Populate mfa_enrolled from Auth0 when available
      }))
    });

  } catch (error) {

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

    // Convert to object and ensure all fields are included
    const userObject = user.toObject();

    // Log what we're sending
    console.log('📤 Sending user data:', {
      _id: userObject._id,
      email: userObject.email,
      full_name: userObject.full_name,
      hasResourceAccess: !!userObject.resource_access,
      resourceAccessCount: userObject.resource_access?.length || 0,
      roleCount: userObject.role_ids?.length || 0
    });

    res.status(200).json({
      success: true,
      data: {
        ...userObject,
        role_name: user.role_ids && user.role_ids.length > 0 ? user.role_ids[0].name : 'User',
        mfa_required: userObject.mfa_required ?? false,
        // TODO: Populate mfa_enrolled from Auth0 here
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// POST /api/users - Create user
router.post('/', validateUserCreation, async (req, res) => {
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
      password,
      role_ids,
      roleIds,
      is_active,
      isActive,
      mfa_required,
      mfaRequired,
      resource_access,
      replace_resource_access,
      document_categories,
      engineering_disciplines,
      send_invite_email,
      sendInviteEmail: sendInviteEmailFromBody
    } = req.body;

    // Normalize camelCase to snake_case
    full_name = full_name || fullName;
    first_name = first_name || firstName;
    last_name = last_name || lastName;
    role_ids = role_ids || roleIds;
    is_active = is_active !== undefined ? is_active : isActive;
    mfa_required = mfa_required !== undefined ? mfa_required : (mfaRequired !== undefined ? mfaRequired : false);
    send_invite_email = send_invite_email !== undefined ? send_invite_email : sendInviteEmailFromBody;

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

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if user already exists in Auth0
    let existingAuth0User = null;
    try {
      existingAuth0User = await getAuth0UserByEmail(email.toLowerCase().trim());
      if (existingAuth0User) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists in Auth0. Please contact support.',
          auth0_user_id: existingAuth0User.user_id
        });
      }
    } catch (auth0CheckError) {
      console.error('Error checking Auth0 for existing user:', auth0CheckError.message);
      // Continue with creation - Auth0 check failed but we can still try to create
    }

    // Filter out empty strings from role_ids
    if (role_ids !== undefined) {
      role_ids = role_ids.filter(id => id && id.trim() !== '');
    }

    // Role is required for user creation
    if (!role_ids || role_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    // Validate role IDs
    const validRoles = await Role.find({ _id: { $in: role_ids } });
    if (validRoles.length !== role_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more role IDs are invalid'
      });
    }

    // Validate resource_access if provided
    if (resource_access !== undefined) {
      if (!Array.isArray(resource_access)) {
        return res.status(400).json({
          success: false,
          message: 'resource_access must be an array'
        });
      }

      // Validate each resource access entry
      const validResourceTypes = ['org', 'site', 'building', 'floor', 'tenant', 'document', 'asset', 'vendor', 'customer', 'user', 'analytics', 'document_category', 'document_discipline'];
      
      for (const access of resource_access) {
        if (!access.resource_type || !validResourceTypes.includes(access.resource_type)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource_type: ${access.resource_type}. Must be one of: ${validResourceTypes.join(', ')}`
          });
        }
        
        if (!access.resource_id || typeof access.resource_id !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'resource_id is required and must be a string'
          });
        }

        if (!access.permissions || typeof access.permissions !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'permissions object is required'
          });
        }

        // Validate permissions structure
        const requiredPermissions = ['can_view', 'can_create', 'can_edit', 'can_delete'];
        for (const perm of requiredPermissions) {
          if (typeof access.permissions[perm] !== 'boolean') {
            return res.status(400).json({
              success: false,
              message: `permissions.${perm} must be a boolean`
            });
          }
        }
      }
    }

    // Validate document_categories if provided
    if (document_categories !== undefined) {
      if (!Array.isArray(document_categories)) {
        return res.status(400).json({
          success: false,
          message: 'document_categories must be an array'
        });
      }

      // Validate each document category is a string
      for (const category of document_categories) {
        if (typeof category !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each document_category must be a string'
          });
        }
      }
    }

    // Validate engineering_disciplines if provided
    if (engineering_disciplines !== undefined) {
      if (!Array.isArray(engineering_disciplines)) {
        return res.status(400).json({
          success: false,
          message: 'engineering_disciplines must be an array'
        });
      }

      // Validate each engineering discipline is a string
      for (const discipline of engineering_disciplines) {
        if (typeof discipline !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each engineering_discipline must be a string'
          });
        }
      }
    }

    // Try to use transactions if MongoDB supports it (replica set)
    const mongoose = require('mongoose');



    // Track the created user for rollback purposes
    let createdUser = null;

    try {



      // Create user
      const userData = {
        email: email.toLowerCase().trim(),
        full_name: full_name.trim(),
        phone: phone?.trim(),
        role_ids: role_ids || [],
        is_active: is_active !== undefined ? is_active : true,
        // mfa_required: mfa_required !== undefined ? mfa_required : false, // not used anymore always mfa enabled
        tenant_id: req.tenant?.tenantId // Add tenant_id from request context
      };

      // Add resource_access if provided
      if (resource_access !== undefined) {
        userData.resource_access = resource_access.map(access => ({
          ...access,
          granted_at: new Date()
        }));
      }

      // Add document_categories if provided
      if (document_categories !== undefined) {
        userData.document_categories = document_categories.map(category => category.trim()).filter(category => category.length > 0);
      }

      // Add engineering_disciplines if provided
      if (engineering_disciplines !== undefined) {
        userData.engineering_disciplines = engineering_disciplines.map(discipline => discipline.trim()).filter(discipline => discipline.length > 0);
      }

      const user = new User(userData);

      // Save with session if available

        await user.save();
        createdUser = user; // Track for rollback


      // Create user in Auth0 - REQUIRED for success
      console.log(`🔐 Creating Auth0 user for: ${email.toLowerCase().trim()}`);

      const auth0User = await ensureAuth0User({
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        password: password, // Pass password if provided
        is_active: user.is_active,
        role_ids: user.role_ids,
        mfa_required: true // always require MFA for new users
      });

      // Verify Auth0 user was created
      if (!auth0User || !auth0User.user_id) {
        throw new Error('Failed to create user in Auth0 - no user ID returned');
      }

      // Store Auth0 user ID in MongoDB
      user.auth0_id = auth0User.user_id;

        await user.save();
     

      

      console.log(`✅ Auth0 user created successfully: ${auth0User.user_id}${password ? ' with password' : ''}`);

      // Send invite email if requested
      let inviteSent = false;
      let inviteError = null;

      if (send_invite_email && password) {
        try {
          console.log(`📧 Sending invite email to: ${user.email} with password`);

          // Send email with credentials directly (not via Auth0)
          const emailResult = await emailService.sendUserInvite({
            to: user.email,
            userName: user.full_name,
            userEmail: user.email,
            password: password
          });

          if (emailResult.success) {
            inviteSent = true;
            console.log(`✅ Invite email sent successfully to: ${user.email} (Message ID: ${emailResult.messageId})`);
          } else {
            inviteError = emailResult.error || 'Failed to send email';
            console.error(`⚠️ Failed to send invite email: ${inviteError}`);
          }
        } catch (inviteErr) {
          console.error(`⚠️ Failed to send invite email to ${user.email}:`, inviteErr.message);
          inviteError = inviteErr.message;
          // Don't fail user creation if invite email fails
          // User can be invited manually later
        }
      } else if (send_invite_email && !password) {
        console.log(`⚠️ Cannot send invite email - password is required to send credentials`);
        inviteError = 'Password is required to send invite email with credentials';
      }

      // Log audit
      // await logAudit({
      //   action: 'create',
      //   resource_type: 'user',
      //   resource_id: user._id.toString(),
      //   resource_name: user.full_name,
      //   status: 'success',
      //   details: {
      //     auth0_synced: true,
      //     auth0_id: auth0User.user_id
      //   }
      // }, req);

      // Populate roles before returning
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


      console.error('❌ Error creating user:', error);

      // Rollback: manually delete the MongoDB user if it was created
      if (createdUser && createdUser._id) {
        try {
          await User.findByIdAndDelete(createdUser._id);
          console.log(`⚠️  Rolled back MongoDB user creation after Auth0 failure: ${createdUser.email}`);
        } catch (deleteError) {
          console.error('Failed to rollback user creation:', deleteError);
        }
      }

      // Log audit failure
      // await logAudit({
      //   action: 'create',
      //   resource_type: 'user',
      //   status: 'error',
      //   error_message: error.message
      // }, req);

      // Check for specific error types and provide user-friendly messages
      let errorMessage = 'Error creating user';
      let statusCode = 400;

      if (error.message.includes('PasswordStrengthError') || error.message.includes('Password is too weak')) {
        errorMessage = 'Password is too weak. Please use a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.';
        statusCode = 400;
      } else if (error.statusCode === 409 || error.message.includes('already exists')) {
        errorMessage = 'User with this email already exists';
        statusCode = 409;
      } else {
        errorMessage = error.message || 'Error creating user';
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: error.message // Keep original error for debugging
      });
    }

  } catch (error) {

    console.error('❌ Outer error creating user:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', validateUserElevation, async (req, res) => {
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
      password,
      role_ids,
      roleIds,
      is_active,
      isActive,
      mfa_required,
      mfaRequired,
      resource_access,
      replace_resource_access,
      document_categories,
      engineering_disciplines,
      send_invite_email: sendInviteEmailFromBody
    } = req.body;

    console.log(`📧 req.body here ... ${JSON.stringify(req.body)}`);

    // Normalize camelCase to snake_case
    full_name = full_name || fullName;
    first_name = first_name || firstName;
    last_name = last_name || lastName;
    role_ids = role_ids || roleIds;
    is_active = is_active !== undefined ? is_active : isActive;
    mfa_required = mfa_required !== undefined ? mfa_required : mfaRequired;

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

    // Filter out empty strings from role_ids
    if (role_ids !== undefined) {
      role_ids = role_ids.filter(id => id && id.trim() !== '');
    }

    // Role is required - if role_ids is being updated, it cannot be empty
    if (role_ids !== undefined && role_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
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

    // Validate resource_access if provided
    if (resource_access !== undefined) {
      if (!Array.isArray(resource_access)) {
        return res.status(400).json({
          success: false,
          message: 'resource_access must be an array'
        });
      }

      // Validate each resource access entry
      const validResourceTypes = ['org', 'site', 'building', 'floor', 'tenant', 'document', 'asset', 'vendor', 'customer', 'user', 'analytics', 'document_category', 'document_discipline'];
      
      for (const access of resource_access) {
        if (!access.resource_type || !validResourceTypes.includes(access.resource_type)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource_type: ${access.resource_type}. Must be one of: ${validResourceTypes.join(', ')}`
          });
        }
        
        if (!access.resource_id || typeof access.resource_id !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'resource_id is required and must be a string'
          });
        }

        if (!access.permissions || typeof access.permissions !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'permissions object is required'
          });
        }

        // Validate permissions structure
        const requiredPermissions = ['can_view', 'can_create', 'can_edit', 'can_delete'];
        for (const perm of requiredPermissions) {
          if (typeof access.permissions[perm] !== 'boolean') {
            return res.status(400).json({
              success: false,
              message: `permissions.${perm} must be a boolean`
            });
          }
        }
      }
    }

    // Validate document_categories if provided
    if (document_categories !== undefined) {
      if (!Array.isArray(document_categories)) {
        return res.status(400).json({
          success: false,
          message: 'document_categories must be an array'
        });
      }

      // Validate each document category is a string
      for (const category of document_categories) {
        if (typeof category !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each document_category must be a string'
          });
        }
      }
    }

    // Validate engineering_disciplines if provided
    if (engineering_disciplines !== undefined) {
      if (!Array.isArray(engineering_disciplines)) {
        return res.status(400).json({
          success: false,
          message: 'engineering_disciplines must be an array'
        });
      }

      // Validate each engineering discipline is a string
      for (const discipline of engineering_disciplines) {
        if (typeof discipline !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each engineering_discipline must be a string'
          });
        }
      }
    }

    // Prepare update data
    const updateData = {};
    if (email) updateData.email = email.toLowerCase().trim();
    if (full_name) updateData.full_name = full_name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim();
    if (role_ids !== undefined) updateData.role_ids = role_ids;
    if (is_active !== undefined) updateData.is_active = is_active;
    // if (mfa_required !== undefined) updateData.mfa_required = mfa_required;

    // Log role_ids update for debugging
    if (role_ids !== undefined) {
      console.log(`📝 Updating user ${user.email} roles:`, {
        previous_roles: user.role_ids,
        new_roles: role_ids,
        role_count: role_ids.length
      });
    }

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
        // Replace all existing resource access with new ones
        user.resource_access = resource_access.map(access => ({
          ...access,
          granted_at: new Date()
        }));
        console.log(`🔄 Replaced resource access for user ${user.email} with ${resource_access.length} entries`);
      } else {
        // Append new resource access to existing ones
        const newAccess = resource_access.map(access => ({
          ...access,
          granted_at: new Date()
        }));
        user.resource_access = [...(user.resource_access || []), ...newAccess];
        console.log(`➕ Added ${resource_access.length} resource access entries to user ${user.email}`);
      }
    }

    // Handle document_categories update
    if (document_categories !== undefined) {
      user.document_categories = document_categories.map(category => category.trim()).filter(category => category.length > 0);
      console.log(`📄 Updated document_categories for user ${user.email} with ${user.document_categories.length} categories`);
    }

    // Handle engineering_disciplines update
    if (engineering_disciplines !== undefined) {
      user.engineering_disciplines = engineering_disciplines.map(discipline => discipline.trim()).filter(discipline => discipline.length > 0);
      console.log(`🔧 Updated engineering_disciplines for user ${user.email} with ${user.engineering_disciplines.length} disciplines`);
    }

    user.updated_at = new Date();
    await user.save();

    // Verify the save was successful
    console.log(`✅ User ${user.email} saved successfully with ${user.role_ids.length} roles`);

    // Update password in Auth0 if provided
    let passwordUpdated = false;
    let inviteEmailSent = false;
    let inviteEmailError = null;
    if (password) {
      if (!user.auth0_id) {
        // Create Auth0 user first if it doesn't exist
        try {
          const auth0User = await ensureAuth0User({
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
          await setAuth0Password(user.auth0_id, password);
          passwordUpdated = true;
        } catch (passwordError) {
          console.error('Failed to update password in Auth0:', passwordError.message);
          // Continue - password update failed but user data is updated
        }
      }

      console.log(`📧 passwordUpdated ${passwordUpdated} sendInviteEmailFromBody ${sendInviteEmailFromBody}`);

      // Send invite email if requested and password was updated successfully
      if (passwordUpdated && sendInviteEmailFromBody === true) {
        console.log(`📧 Sending invite email to ${user.email} with updated password`);
        try {
          const emailResult = await emailService.sendUserInvite({
            to: user.email,
            userName: user.full_name,
            userEmail: user.email,
            password: password
          });

          if (emailResult.success) {
            inviteEmailSent = true;
            console.log(`✅ Invite email sent to ${user.email}`);
          } else {
            inviteEmailError = emailResult.error || 'Unknown error sending email';
            console.error(`❌ Failed to send invite email: ${inviteEmailError}`);
          }
        } catch (emailError) {
          inviteEmailError = emailError.message;
          console.error('Failed to send invite email:', emailError);
          // Don't fail the request if email fails - user and password are already updated
        }
      }
    }

    // Update user in Auth0 (if auth0_id exists)
    let auth0Updated = false;
    let rolesSynced = false;
    if (user.auth0_id) {
      try {
        await updateAuth0User(user.auth0_id, updateData);
        auth0Updated = true;
        
        // Sync roles if role_ids were updated
        if (role_ids !== undefined) {
          try {
            const syncResult = await syncUserRoles(user.auth0_id, role_ids);
            rolesSynced = true;
            console.log(`✅ Roles synced for user ${user.email}:`, syncResult);
          } catch (roleSyncError) {
            console.error('Auth0 role sync failed:', roleSyncError.message);
          }
        }
      } catch (auth0Error) {
        console.error('Auth0 user update failed:', auth0Error.message);
        // Continue even if Auth0 update fails - user updated in MongoDB
      }
    }

    // Log audit
    // await logAudit({
    //   action: 'update',
    //   resource_type: 'user',
    //   resource_id: user._id.toString(),
    //   resource_name: user.full_name,
    //   status: 'success',
    //   details: {
    //     auth0_synced: auth0Updated,
    //     roles_synced: rolesSynced,
    //     auth0_id: user.auth0_id
    //   }
    // }, req);

    // Populate roles before returning
    await user.populate('role_ids', 'name description permissions');

    // Build response message
    let message = 'User updated successfully';
    if (password && !passwordUpdated) {
      message = 'User updated successfully, but password update failed';
    } else if (password && passwordUpdated) {
      if (inviteEmailSent) {
        message = 'User updated successfully, password updated and invite email sent';
      } else if (sendInviteEmailFromBody && inviteEmailError) {
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

    // Log audit failure
    // await logAudit({
    //   action: 'update',
    //   resource_type: 'user',
    //   resource_id: id,
    //   status: 'error',
    //   error_message: error.message
    // }, req);

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
    const auth0Id = user.auth0_id;

    // Log user details for debugging
    console.log(`🔍 User deletion attempt:`, {
      mongoId: user._id,
      email: user.email,
      auth0Id: auth0Id,
      auth0IdType: typeof auth0Id,
      auth0IdValue: JSON.stringify(auth0Id)
    });

    // Delete from Auth0 FIRST (if auth0_id exists)
    let auth0Deleted = false;
    if (auth0Id) {
      try {
        // Ensure auth0_id is a string
        const auth0IdString = typeof auth0Id === 'string' ? auth0Id : String(auth0Id);
        await deleteAuth0User(auth0IdString);
        auth0Deleted = true;
        console.log(`✅ Deleted user from Auth0: ${auth0IdString}`);
      } catch (auth0Error) {
        console.error('❌ Auth0 user deletion failed:', auth0Error.message);

        // Check for specific Auth0 errors
        let errorMessage = auth0Error.message;
        if (auth0Error.message.includes('invalid_uri') || auth0Error.message.includes("didn't pass validation")) {
          errorMessage = `Invalid Auth0 user ID format. The user may have corrupted data. Auth0 ID: ${JSON.stringify(auth0Id)}`;
        } else if (auth0Error.message.includes('404') || auth0Error.message.includes('not found')) {
          // User doesn't exist in Auth0, so we can proceed with MongoDB deletion
          console.log('⚠️ User not found in Auth0, proceeding with MongoDB deletion');
          auth0Deleted = false;
        } else {
          // Other errors - fail the operation
          return res.status(500).json({
            success: false,
            message: 'Failed to delete user from Auth0. User not deleted from database.',
            error: errorMessage,
            auth0_synced: false
          });
        }

        // If we reached here and it's a 404, continue with deletion
        if (!auth0Error.message.includes('404') && !auth0Error.message.includes('not found')) {
          return res.status(500).json({
            success: false,
            message: 'Failed to delete user from Auth0. User not deleted from database.',
            error: errorMessage,
            auth0_synced: false
          });
        }
      }
    } else {
      console.log(`⚠️ User has no auth0_id, skipping Auth0 deletion`);
    }

    // Only delete from MongoDB after Auth0 deletion succeeds
    await User.findByIdAndDelete(id);
    console.log(`✅ Deleted user from MongoDB: ${user.email}`);

    // Log audit
    // await logAudit({
    //   action: 'delete',
    //   resource_type: 'user',
    //   resource_id: id,
    //   resource_name: userName,
    //   status: 'success',
    //   details: {
    //     auth0_synced: auth0Deleted,
    //     auth0_id: auth0Id
    //   }
    // }, req);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      auth0_synced: auth0Deleted
    });

  } catch (error) {

    // Log audit failure
    // await logAudit({
    //   action: 'delete',
    //   resource_type: 'user',
    //   resource_id: id,
    //   status: 'error',
    //   error_message: error.message
    // }, req);

    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

// POST /api/users/:id/resend-invite - Resend invite email to existing user
router.post('/:id/resend-invite', async (req, res) => {
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
      console.log(`📧 Resending invite email to: ${user.email}`);

      // Generate a new temporary password
      const temporaryPassword = generateRandomPassword(14);

      // Update password in Auth0
      if (user.auth0_id) {
        try {
          console.log(`🔐 Setting new password in Auth0 for user: ${user.auth0_id}`);
          await setAuth0Password(user.auth0_id, temporaryPassword);
          console.log(`✅ Password updated in Auth0`);
        } catch (auth0Error) {
          console.error(`⚠️ Failed to update Auth0 password: ${auth0Error.message}`);
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

      console.log(`✅ Invite email resent successfully to: ${user.email}`);

      res.status(200).json({
        success: true,
        message: 'Invite email sent successfully with new credentials',
        invite_sent: true,
        messageId: emailResult.messageId
      });
    } catch (inviteError) {
      console.error(`❌ Failed to send invite email to ${user.email}:`, inviteError.message);

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

    // Block user in Auth0 (if auth0_id exists)
    let auth0Updated = false;
    if (user.auth0_id) {
      try {
        await updateAuth0User(user.auth0_id, { is_active: false });
        auth0Updated = true;
      } catch (auth0Error) {
        console.error('Auth0 user block failed:', auth0Error.message);
        // Continue even if Auth0 update fails - user deactivated in MongoDB
      }
    }

    // Log audit
    // await logAudit({
    //   action: 'deactivate',
    //   resource_type: 'user',
    //   resource_id: user._id.toString(),
    //   resource_name: user.full_name,
    //   user_id: deactivated_by,
    //   status: 'success',
    //   details: {
    //     auth0_synced: auth0Updated,
    //     auth0_id: user.auth0_id
    //   }
    // }, req);

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data: user,
      auth0_synced: auth0Updated
    });

  } catch (error) {

    // Log audit failure
    // await logAudit({
    //   action: 'deactivate',
    //   resource_type: 'user',
    //   resource_id: id,
    //   status: 'error',
    //   error_message: error.message
    // }, req);

    res.status(500).json({
      success: false,
      message: 'Error deactivating user',
      error: error.message
    });
  }
});

/**
 * DELETE /api/users/:id/mfa
 * Reset MFA for a user (sets mfa_required to false)
 * TODO: Integrate with Auth0 to remove enrolled factors once Management API wired up
 */
router.delete('/:id/mfa', async (req, res) => {
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

    res.status(500).json({
      success: false,
      message: 'Error fetching resource access',
      error: error.message
    });
  }
});

// POST /api/users/resource-access - Assign resource access with permissions
router.post('/resource-access', async (req, res) => {
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

    // Log audit
    // await logAudit({
    //   action: 'grant_access',
    //   resource_type: resource_type,
    //   resource_id: resource_id,
    //   resource_name: resource_name,
    //   user_id: granted_by,
    //   details: { target_user_id: user_id },
    //   status: 'success'
    // }, req);

    res.status(200).json({
      success: true,
      message: 'Resource access granted successfully',
      data: user.resource_access[user.resource_access.length - 1]
    });

  } catch (error) {

    // Log audit failure
    // await logAudit({
    //   action: 'grant_access',
    //   resource_type: req.body.resource_type,
    //   resource_id: req.body.resource_id,
    //   status: 'error',
    //   error_message: error.message
    // }, req);

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
    // await logAudit({
    //   action: 'revoke_access',
    //   resource_type: removedAccess.resource_type,
    //   resource_id: removedAccess.resource_id,
    //   resource_name: removedAccess.resource_name,
    //   details: { target_user_id: user_id },
    //   status: 'success'
    // }, req);

    res.status(200).json({
      success: true,
      message: 'Resource access removed successfully'
    });

  } catch (error) {

    // Log audit failure
    // await logAudit({
    //   action: 'revoke_access',
    //   resource_type: 'unknown',
    //   resource_id: req.params.id,
    //   status: 'error',
    //   error_message: error.message
    // }, req);

    res.status(500).json({
      success: false,
      message: 'Error removing resource access',
      error: error.message
    });
  }
});



module.exports = router;
