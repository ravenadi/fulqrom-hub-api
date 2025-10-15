const { ManagementClient } = require('auth0');

// Check if Auth0 is enabled
const isAuth0Enabled = () => {
  return process.env.USE_AUTH0 === 'true';
};

// Initialize Auth0 Management Client
const getAuth0Client = () => {
  if (!isAuth0Enabled()) {
    throw new Error('Auth0 integration is disabled');
  }

  return new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    scope: 'read:users create:users update:users delete:users'
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
  if (!isAuth0Enabled()) {
    return null;
  }

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
  if (!isAuth0Enabled()) {
    return null;
  }

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
  if (!isAuth0Enabled()) {
    return;
  }

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
  if (!isAuth0Enabled()) {
    return null;
  }

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
  if (!isAuth0Enabled()) {
    throw new Error('Auth0 integration is disabled. Cannot send password reset email.');
  }

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

module.exports = {
  isAuth0Enabled,
  createAuth0User,
  updateAuth0User,
  deleteAuth0User,
  getAuth0UserByEmail,
  sendPasswordResetEmail
};
