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
 * @param {string} [userData.phone] - User phone number
 * @param {boolean} [userData.is_active] - User active status
 * @returns {Promise<Object>} Auth0 user object
 */
const createAuth0User = async (userData) => {
  try {
    const management = getAuth0Client();

    // Generate a temporary password (user will reset on first login)
    const tempPassword = `Temp${Math.random().toString(36).slice(-8)}@${Date.now()}`;

    // Auth0 SDK v5 API - response is the user object directly (not wrapped in .data)
    const auth0User = await management.users.create({
      connection: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication',
      email: userData.email,
      password: tempPassword,
      name: userData.full_name,
      user_metadata: {
        full_name: userData.full_name,
        phone: userData.phone || null,
        mongodb_id: userData._id?.toString() || null
      },
      app_metadata: {
        is_active: userData.is_active !== undefined ? userData.is_active : true,
        role_ids: userData.role_ids || []
      },
      email_verified: false,
      verify_email: true, // Send verification email
      blocked: userData.is_active === false
    });

    return auth0User;
  } catch (error) {
    console.error('Auth0 create user error:', error);
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

    if (updateData.email) {
      auth0UpdateData.email = updateData.email;
      auth0UpdateData.email_verified = false; // Re-verify email if changed
      auth0UpdateData.verify_email = true;
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
    await management.users.delete({ id: auth0UserId });
  } catch (error) {
    console.error('Auth0 delete user error:', error.message);
    throw new Error(`Failed to delete user from Auth0: ${error.message}`);
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
      console.log(`✅ Auth0 user already exists: ${existingUser.user_id}`);
      
      // Sync roles if user exists
      if (userData.role_ids && userData.role_ids.length > 0) {
        try {
          await syncUserRoles(existingUser.user_id, userData.role_ids);
        } catch (roleError) {
          console.error('Failed to sync roles for existing user:', roleError.message);
        }
      }
      
      return existingUser;
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

module.exports = {
  createAuth0User,
  updateAuth0User,
  deleteAuth0User,
  getAuth0UserByEmail,
  sendPasswordResetEmail,
  createAuth0Role,
  updateAuth0Role,
  deleteAuth0Role,
  getAuth0RoleByName,
  ensureAuth0User,
  assignRolesToUser,
  removeRolesFromUser,
  syncUserRoles
};
