const { ManagementClient } = require('auth0');

// Initialize Auth0 Management Client
const getAuth0Client = () => {
  return new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    scope: 'read:users create:users update:users delete:users read:roles create:roles update:roles delete:roles'
  });
};

/**
 * Create a user in Auth0
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.full_name - User full name
 * @param {string} [userData.password] - User password (if not provided, generates temporary password)
 * @param {string} [userData.phone] - User phone number
 * @param {boolean} [userData.is_active] - User active status
 * @returns {Promise<Object>} Auth0 user object
 */
const createAuth0User = async (userData) => {
  try {
    const management = getAuth0Client();

    // Use provided password or generate a temporary one as fallback
    const password = userData.password || `Temp${Math.random().toString(36).slice(-8)}@${Date.now()}`;

    // If password was provided by admin, skip email verification for immediate login
    const skipEmailVerification = !!userData.password;

    // Auth0 SDK v5 API - response is the user object directly (not wrapped in .data)
    const auth0User = await management.users.create({
      connection: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication',
      email: userData.email,
      password: password,
      name: userData.full_name,
      user_metadata: {
        full_name: userData.full_name,
        phone: userData.phone || null,
        mongodb_id: userData._id?.toString() || null
      },
      app_metadata: {
        is_active: userData.is_active !== undefined ? userData.is_active : true,
        role_ids: userData.role_ids || [],
        mfa_required: userData.mfa_required || false
      },
      email_verified: skipEmailVerification, // Skip verification if password provided
      verify_email: !skipEmailVerification, // Only send verification if no password
      blocked: userData.is_active === false
    });

    return auth0User;
  } catch (error) {
    console.error('Auth0 create user error:', error);

    // Check for conflict error (user already exists)
    if (error.statusCode === 409 || (error.message && error.message.includes('409'))) {
      const conflictError = new Error(`Failed to create user in Auth0: ConflictError\nStatus code: 409\nBody: ${JSON.stringify({
        statusCode: 409,
        error: 'Conflict',
        message: 'The user already exists.',
        errorCode: 'auth0_idp_error'
      }, null, 2)}`);
      conflictError.statusCode = 409;
      throw conflictError;
    }

    // Check for password strength error
    if (error.statusCode === 400 && (error.message && (error.message.includes('PasswordStrengthError') || error.message.includes('Password is too weak')))) {
      const passwordError = new Error(`Failed to create user in Auth0: BadRequestError\nStatus code: 400\nBody: ${JSON.stringify({
        statusCode: 400,
        error: 'Bad Request',
        message: 'PasswordStrengthError: Password is too weak'
      }, null, 2)}`);
      passwordError.statusCode = 400;
      throw passwordError;
    }

    throw new Error(`Failed to create user in Auth0: ${error.message}`);
  }
};

/**
 * Update a user in Auth0
 * @param {string} auth0UserId - Auth0 user ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated Auth0 user object
 */
const updateAuth0User = async (auth0UserId, updateData) => {
  try {
    const management = getAuth0Client();

    const auth0UpdateData = {};

    // Handle email updates - skip verification if admin is updating
    if (updateData.email) {
      auth0UpdateData.email = updateData.email;
      // If admin provides password with email update, skip verification
      if (updateData.password) {
        auth0UpdateData.email_verified = true;  // Auto-verify for admin updates
        auth0UpdateData.verify_email = false;   // Don't send verification email
      } else {
        auth0UpdateData.email_verified = false; // Re-verify email if changed by user
        auth0UpdateData.verify_email = true;    // Send verification email
      }
    }

    // Handle password updates
    if (updateData.password) {
      auth0UpdateData.password = updateData.password;
      // Ensure email is verified when password is set by admin
      if (!updateData.email) {
        auth0UpdateData.email_verified = true;
      }
    }

    if (updateData.full_name) {
      auth0UpdateData.name = updateData.full_name;
      auth0UpdateData.user_metadata = {
        ...auth0UpdateData.user_metadata,
        full_name: updateData.full_name
      };
    }

    if (updateData.phone !== undefined) {
      auth0UpdateData.user_metadata = {
        ...auth0UpdateData.user_metadata,
        phone: updateData.phone
      };
    }

    if (updateData.is_active !== undefined) {
      auth0UpdateData.blocked = !updateData.is_active;
      auth0UpdateData.app_metadata = {
        ...auth0UpdateData.app_metadata,
        is_active: updateData.is_active
      };
    }

    if (updateData.role_ids !== undefined) {
      auth0UpdateData.app_metadata = {
        ...auth0UpdateData.app_metadata,
        role_ids: updateData.role_ids
      };
    }

    if (updateData.mfa_required !== undefined) {
      auth0UpdateData.app_metadata = {
        ...auth0UpdateData.app_metadata,
        mfa_required: updateData.mfa_required
      };
    }

    // Auth0 SDK v5 API - response is the user object directly
    const updatedUser = await management.users.update(
      { id: auth0UserId },
      auth0UpdateData
    );

    return updatedUser;
  } catch (error) {
    console.error('Auth0 update user error:', error);
    throw new Error(`Failed to update user in Auth0: ${error.message}`);
  }
};

/**
 * Delete a user from Auth0
 * @param {string} auth0UserId - Auth0 user ID
 * @returns {Promise<void>}
 */
const deleteAuth0User = async (auth0UserId) => {
  try {
    const management = getAuth0Client();

    // Validate auth0UserId is a string
    if (!auth0UserId || typeof auth0UserId !== 'string') {
      throw new Error(`Invalid Auth0 user ID: ${auth0UserId}`);
    }

    console.log(`🗑️  Deleting Auth0 user: ${auth0UserId}`);

    // Auth0 SDK v5 API - pass ID directly as string parameter
    await management.users.delete(auth0UserId);

    console.log(`✅ Successfully deleted Auth0 user: ${auth0UserId}`);
  } catch (error) {
    console.error('Auth0 delete user error:', error);

    // Format error message for better debugging
    const errorMessage = error.message || JSON.stringify(error);
    throw new Error(`Failed to delete user from Auth0: ${errorMessage}`);
  }
};

/**
 * Get Auth0 user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} Auth0 user object or null
 */
const getAuth0UserByEmail = async (email) => {
  try {
    const management = getAuth0Client();
    // Auth0 SDK v5 API - list with email query
    const result = await management.users.list({
      q: `email:"${email}"`,
      search_engine: 'v3'
    });
    // Result structure: { users: [...], start: 0, limit: 50, length: 1, total: 1 }
    return result.users && result.users.length > 0 ? result.users[0] : null;
  } catch (error) {
    console.error('Auth0 get user by email error:', error);
    return null;
  }
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<string>} Ticket URL
 */
const sendPasswordResetEmail = async (email) => {
  try {
    const management = getAuth0Client();
    // Auth0 SDK v5 API - response is the ticket object directly
    const ticket = await management.tickets.create({
      email: email,
      connection_id: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication',
      result_url: process.env.CLIENT_URL
    });
    return ticket.ticket;
  } catch (error) {
    console.error('Auth0 password reset error:', error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

/**
 * Send invite email with password setup link
 * This sends an email to the user with a secure link to set their password for the first time
 * If the user doesn't exist in Auth0, creates them first
 * @param {string} email - User email
 * @param {Object} [userData] - Optional user data for Auth0 user creation if user doesn't exist
 * @param {string} [userData.full_name] - User's full name
 * @param {string} [userData.phone] - User's phone number
 * @param {Array<string>} [userData.role_ids] - MongoDB role IDs
 * @returns {Promise<Object>} Object containing ticket URL and success status
 */
const sendInviteEmail = async (email, userData = null) => {
  try {
    console.log(`[sendInviteEmail] Sending invite to: ${email}`);
    const management = getAuth0Client();

    // Get the Auth0 user to retrieve user_id
    let auth0User = await getAuth0UserByEmail(email);
    let userWasCreated = false;

    if (!auth0User) {
      console.log(`[sendInviteEmail] User not found via email search, attempting creation...`);

      if (userData) {
        // Try to create user in Auth0
        console.log(`[sendInviteEmail] Creating Auth0 user for: ${email}`);
        try {
          auth0User = await createAuth0User({
            email: email,
            full_name: userData.full_name || email.split('@')[0],
            phone: userData.phone || null,
            password: null, // No password - they'll set it via invite link
            is_active: true,
            role_ids: userData.role_ids || [],
            mfa_required: userData.mfa_required !== undefined ? userData.mfa_required : true
          });
          userWasCreated = true;
          console.log(`[sendInviteEmail] ✅ Auth0 user created: ${auth0User.user_id}`);
        } catch (createError) {
          // If creation fails with 409 Conflict, user exists but search didn't find them
          // This can happen due to Auth0 search index delays
          if (createError.message && createError.message.includes('409')) {
            console.log(`[sendInviteEmail] ⚠️ User exists in Auth0 but search didn't find them (409 Conflict)`);
            console.log(`[sendInviteEmail] Retrying search after brief delay...`);

            // Wait a moment and try searching again
            await new Promise(resolve => setTimeout(resolve, 1000));
            auth0User = await getAuth0UserByEmail(email);

            if (!auth0User) {
              throw new Error(`User exists in Auth0 (got 409 Conflict) but cannot be found via search. This may be due to Auth0 search index delay. Please try again in a few moments, or check Auth0 dashboard for user: ${email}`);
            }
            console.log(`[sendInviteEmail] ✅ Found user on retry: ${auth0User.user_id}`);
          } else {
            throw createError;
          }
        }
      } else {
        throw new Error(`User not found in Auth0: ${email}. Cannot send invite without user data.`);
      }
    }

    // Create a password change ticket (better for invites than password reset)
    // This allows first-time users to set their password
    const ticket = await management.tickets.create({
      result_url: process.env.CLIENT_URL || 'http://localhost:5173',
      user_id: auth0User.user_id,
      ttl_sec: 432000, // 5 days validity (Auth0 default)
      mark_email_as_verified: true, // Auto-verify email when they set password
      includeEmailInRedirect: false
    });

    console.log(`[sendInviteEmail] ✅ Invite sent successfully to: ${email}`);
    console.log(`[sendInviteEmail] Ticket URL: ${ticket.ticket}`);

    return {
      success: true,
      ticket_url: ticket.ticket,
      message: 'Invite email sent successfully',
      user_created: userWasCreated, // Flag indicating if we created the user
      auth0_user_id: auth0User.user_id // Return the Auth0 user ID
    };
  } catch (error) {
    console.error('[sendInviteEmail] Error sending invite email:', error);
    throw new Error(`Failed to send invite email: ${error.message}`);
  }
};

/**
 * Create a role in Auth0
 * @param {Object} roleData - Role data
 * @param {string} roleData.name - Role name
 * @param {string} [roleData.description] - Role description
 * @param {Array} [roleData.permissions] - Role permissions
 * @returns {Promise<Object>} Auth0 role object
 */
const createAuth0Role = async (roleData) => {
  try {
    const management = getAuth0Client();

    // Auth0 SDK v5 API - create role
    const auth0Role = await management.roles.create({
      name: roleData.name,
      description: roleData.description || ''
    });

    return auth0Role;
  } catch (error) {
    console.error('Auth0 create role error:', error);
    throw new Error(`Failed to create role in Auth0: ${error.message}`);
  }
};

/**
 * Update a role in Auth0
 * @param {string} auth0RoleId - Auth0 role ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated Auth0 role object
 */
const updateAuth0Role = async (auth0RoleId, updateData) => {
  try {
    const management = getAuth0Client();

    const auth0UpdateData = {};

    if (updateData.name) {
      auth0UpdateData.name = updateData.name;
    }

    if (updateData.description !== undefined) {
      auth0UpdateData.description = updateData.description || '';
    }

    // Auth0 SDK v5 API - update role
    const updatedRole = await management.roles.update(
      { id: auth0RoleId },
      auth0UpdateData
    );

    return updatedRole;
  } catch (error) {
    console.error('Auth0 update role error:', error);
    throw new Error(`Failed to update role in Auth0: ${error.message}`);
  }
};

/**
 * Delete a role from Auth0
 * @param {string} auth0RoleId - Auth0 role ID
 * @returns {Promise<void>}
 */
const deleteAuth0Role = async (auth0RoleId) => {
  try {
    const management = getAuth0Client();
    await management.roles.delete({ id: auth0RoleId });
  } catch (error) {
    console.error('Auth0 delete role error:', error.message);
    throw new Error(`Failed to delete role from Auth0: ${error.message}`);
  }
};

/**
 * Get Auth0 role by name
 * @param {string} name - Role name
 * @returns {Promise<Object|null>} Auth0 role object or null
 */
const getAuth0RoleByName = async (name) => {
  try {
    const management = getAuth0Client();
    // Auth0 SDK v5 API - list all roles and filter by name
    const result = await management.roles.list();
    
    // Auth0 SDK v5 returns roles in the 'data' property
    const roles = result.data || result.roles || [];
    
    // Filter roles by name (case-insensitive)
    const matchingRole = roles.find(role => 
      role.name && role.name.toLowerCase() === name.toLowerCase()
    );
    
    return matchingRole || null;
  } catch (error) {
    console.error('Auth0 get role by name error:', error);
    return null;
  }
};

/**
 * Assign roles to an Auth0 user
 * @param {string} auth0UserId - Auth0 user ID
 * @param {Array<string>} roleIds - Array of MongoDB role IDs
 * @returns {Promise<Object>} Assignment result
 */
const assignRolesToUser = async (auth0UserId, roleIds) => {
  try {
    const management = getAuth0Client();
    
    if (!roleIds || roleIds.length === 0) {
      console.log('No roles to assign');
      return { assigned: 0, skipped: 0 };
    }

    // Get Auth0 roles that correspond to our MongoDB role IDs
    const auth0RoleIds = [];
    let assignedCount = 0;
    let skippedCount = 0;

    for (const roleId of roleIds) {
      try {
        // Find the role in our MongoDB to get the name
        const RoleV2 = require('../models/v2/Role');
        const role = await RoleV2.findById(roleId);
        
        if (!role) {
          console.log(`⚠️ MongoDB role not found: ${roleId}`);
          skippedCount++;
          continue;
        }

        // Find corresponding Auth0 role by name
        const auth0Role = await getAuth0RoleByName(role.name);
        
        if (auth0Role) {
          auth0RoleIds.push(auth0Role.id);
          console.log(`✅ Found Auth0 role for "${role.name}": ${auth0Role.id}`);
        } else {
          console.log(`⚠️ Auth0 role not found for "${role.name}", creating it...`);
          try {
            // Create Auth0 role if it doesn't exist
            const newAuth0Role = await createAuth0Role({
              name: role.name,
              description: role.description || `Role: ${role.name}`
            });
            auth0RoleIds.push(newAuth0Role.id);
            console.log(`🆕 Created Auth0 role "${role.name}": ${newAuth0Role.id}`);
          } catch (createError) {
            console.error(`Failed to create Auth0 role "${role.name}":`, createError.message);
            skippedCount++;
            continue;
          }
        }
      } catch (error) {
        console.error(`Error processing role ${roleId}:`, error.message);
        skippedCount++;
      }
    }

    // Assign roles to user in Auth0
    if (auth0RoleIds.length > 0) {
      await management.users.roles.assign(auth0UserId, { roles: auth0RoleIds });
      assignedCount = auth0RoleIds.length;
      console.log(`✅ Assigned ${assignedCount} roles to Auth0 user: ${auth0UserId}`);
    }

    return { assigned: assignedCount, skipped: skippedCount };
  } catch (error) {
    console.error('Auth0 assign roles error:', error);
    throw new Error(`Failed to assign roles in Auth0: ${error.message}`);
  }
};

/**
 * Remove roles from an Auth0 user
 * @param {string} auth0UserId - Auth0 user ID
 * @param {Array<string>} roleIds - Array of MongoDB role IDs to remove
 * @returns {Promise<Object>} Removal result
 */
const removeRolesFromUser = async (auth0UserId, roleIds) => {
  try {
    const management = getAuth0Client();
    
    if (!roleIds || roleIds.length === 0) {
      console.log('No roles to remove');
      return { removed: 0, skipped: 0 };
    }

    const auth0RoleIds = [];
    let removedCount = 0;
    let skippedCount = 0;

    for (const roleId of roleIds) {
      try {
        // Find the role in our MongoDB to get the name
        const RoleV2 = require('../models/v2/Role');
        const role = await RoleV2.findById(roleId);
        
        if (!role) {
          console.log(`⚠️ MongoDB role not found: ${roleId}`);
          skippedCount++;
          continue;
        }

        // Find corresponding Auth0 role by name
        const auth0Role = await getAuth0RoleByName(role.name);
        
        if (auth0Role) {
          auth0RoleIds.push(auth0Role.id);
        } else {
          console.log(`⚠️ Auth0 role not found for "${role.name}"`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing role ${roleId}:`, error.message);
        skippedCount++;
      }
    }

    // Remove roles from user in Auth0
    if (auth0RoleIds.length > 0) {
      await management.users.roles.delete(auth0UserId, { roles: auth0RoleIds });
      removedCount = auth0RoleIds.length;
      console.log(`✅ Removed ${removedCount} roles from Auth0 user: ${auth0UserId}`);
    }

    return { removed: removedCount, skipped: skippedCount };
  } catch (error) {
    console.error('Auth0 remove roles error:', error);
    throw new Error(`Failed to remove roles in Auth0: ${error.message}`);
  }
};

/**
 * Sync user roles between MongoDB and Auth0
 * @param {string} auth0UserId - Auth0 user ID
 * @param {Array<string>} newRoleIds - New role IDs from MongoDB
 * @returns {Promise<Object>} Sync result
 */
const syncUserRoles = async (auth0UserId, newRoleIds) => {
  try {
    const management = getAuth0Client();
    
    // Get current Auth0 roles for the user using the correct API
    let currentAuth0Roles = [];
    try {
      const rolesResponse = await management.users.roles.list(auth0UserId);
      // Auth0 SDK v5 returns roles in the 'data' property
      currentAuth0Roles = rolesResponse.data || rolesResponse.roles || rolesResponse || [];
      console.log(`Current Auth0 roles for user ${auth0UserId}:`, currentAuth0Roles.map(r => r.name || r));
    } catch (getRolesError) {
      console.log(`Could not get current roles for user ${auth0UserId}:`, getRolesError.message);
      // Continue with empty roles array
    }

    // Get new Auth0 role IDs
    const newAuth0RoleIds = [];
    const RoleV2 = require('../models/v2/Role');
    
    for (const roleId of newRoleIds) {
      const role = await RoleV2.findById(roleId);
      if (role) {
        let auth0Role = await getAuth0RoleByName(role.name);
        if (!auth0Role) {
          // Create Auth0 role if it doesn't exist
          auth0Role = await createAuth0Role({
            name: role.name,
            description: role.description || `Role: ${role.name}`
          });
        }
        newAuth0RoleIds.push(auth0Role.id);
      }
    }

    // Remove old roles and assign new ones
    const currentRoleIds = currentAuth0Roles.map(r => r.id || r);
    const rolesToRemove = currentRoleIds.filter(id => !newAuth0RoleIds.includes(id));
    const rolesToAdd = newAuth0RoleIds.filter(id => !currentRoleIds.includes(id));

    let result = { added: 0, removed: 0, skipped: 0 };

    if (rolesToRemove.length > 0) {
      await management.users.roles.delete(auth0UserId, { roles: rolesToRemove });
      result.removed = rolesToRemove.length;
      console.log(`✅ Removed ${result.removed} roles from Auth0 user`);
    }

    if (rolesToAdd.length > 0) {
      await management.users.roles.assign(auth0UserId, { roles: rolesToAdd });
      result.added = rolesToAdd.length;
      console.log(`✅ Added ${result.added} roles to Auth0 user`);
    }

    return result;
  } catch (error) {
    console.error('Auth0 sync roles error:', error);
    throw new Error(`Failed to sync roles in Auth0: ${error.message}`);
  }
};

/**
 * Check if user exists in Auth0 and create if not exists
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Auth0 user object (existing or newly created)
 */
const ensureAuth0User = async (userData) => {
  try {
    // First check if user already exists
    const existingUser = await getAuth0UserByEmail(userData.email);
    if (existingUser) {
      console.log(`⚠️ Auth0 user already exists: ${existingUser.user_id} for email: ${userData.email}`);

      // Throw conflict error to trigger rollback in the calling function
      const conflictError = new Error(`Failed to create user in Auth0: ConflictError\nStatus code: 409\nBody: ${JSON.stringify({
        statusCode: 409,
        error: 'Conflict',
        message: 'The user already exists.',
        errorCode: 'auth0_idp_error'
      }, null, 2)}`);
      conflictError.statusCode = 409;
      throw conflictError;
    }

    // User doesn't exist, create new one
    console.log(`🆕 Creating new Auth0 user for: ${userData.email}`);
    const newUser = await createAuth0User(userData);

    // Assign roles to new user
    if (userData.role_ids && userData.role_ids.length > 0) {
      try {
        await assignRolesToUser(newUser.user_id, userData.role_ids);
      } catch (roleError) {
        console.error('Failed to assign roles to new user:', roleError.message);
      }
    }

    return newUser;
  } catch (error) {
    console.error('Error ensuring Auth0 user:', error);
    throw error;
  }
};

/**
 * Set or update user password in Auth0 using Management API
 * Works with M2M applications (doesn't require password grant type)
 * Uses direct fetch API call like the change-password endpoint
 * @param {string} auth0_id - Auth0 user ID
 * @param {string} password - New password
 * @returns {Promise<Object>} Success object
 */
const setAuth0Password = async (auth0_id, password) => {
  try {
    console.log(`[setAuth0Password] Starting password update for auth0_id: ${auth0_id}`);
    
    // Validate password length
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Get Management API token using the same method as change-password endpoint
    // Use direct fetch for consistency with working change-password endpoint
    console.log(`[setAuth0Password] Getting Management API token from: ${process.env.AUTH0_DOMAIN}`);
    const tokenResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: process.env.AUTH0_MANAGEMENT_API_AUDIENCE || `https://${process.env.AUTH0_DOMAIN}/api/v2/`
      })
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.json().catch(() => ({}));
      console.error('[setAuth0Password] Token request failed:', tokenError);
      throw new Error('Failed to get Auth0 Management API token: ' + (tokenError.error_description || tokenError.message || 'Unknown error'));
    }

    const tokenData = await tokenResponse.json();
    const managementToken = tokenData.access_token;
    console.log(`[setAuth0Password] Successfully obtained management token`);

    // Update password using Auth0 Management API (same approach as change-password)
    console.log(`[setAuth0Password] Updating password for user: ${auth0_id}`);
    const updateResponse = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${auth0_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${managementToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: password,
          connection: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication'
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.description || 'Failed to update password';
      console.error('[setAuth0Password] Password update failed:', errorMessage);
      console.error('[setAuth0Password] Full error response:', errorData);
      
      // Handle specific Auth0 errors
      if (errorMessage.includes('PasswordStrengthError') || 
          errorMessage.includes('Password is too weak')) {
        throw new Error('Password does not meet Auth0 password strength requirements');
      }
      
      throw new Error(errorMessage);
    }

    console.log(`[setAuth0Password] Password updated successfully for: ${auth0_id}`);
    return { success: true, message: 'Password set successfully' };
  } catch (error) {
    console.error('[setAuth0Password] Error:', error.message || error);
    const errorMessage = error.message || 'Failed to update password';
    throw new Error(errorMessage);
  }
};

module.exports = {
  getAuth0Client,
  createAuth0User,
  updateAuth0User,
  deleteAuth0User,
  getAuth0UserByEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
  createAuth0Role,
  updateAuth0Role,
  deleteAuth0Role,
  getAuth0RoleByName,
  ensureAuth0User,
  assignRolesToUser,
  removeRolesFromUser,
  syncUserRoles,
  setAuth0Password
};
