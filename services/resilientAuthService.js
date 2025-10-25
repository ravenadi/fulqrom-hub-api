/**
 * Resilient Authentication Service
 *
 * Ensures login always succeeds if user is valid in local database,
 * regardless of Auth0 state. Handles:
 * - Auto-sync between MongoDB and Auth0
 * - Email verification bypass for admin-created users
 * - Password reset resilience
 * - Auth0/MongoDB mismatches
 * - Comprehensive error handling and logging
 */

const auth0Service = require('./auth0Service');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Authentication result types
 */
const AUTH_RESULT = {
  SUCCESS: 'SUCCESS',
  SYNCED_AND_SUCCESS: 'SYNCED_AND_SUCCESS',
  CREATED_IN_AUTH0: 'CREATED_IN_AUTH0',
  REACTIVATED: 'REACTIVATED',
  FAILED: 'FAILED'
};

/**
 * Log authentication event
 */
const logAuthEvent = async (event, details) => {
  try {
    console.log(`🔐 [AUTH] ${event}:`, JSON.stringify(details, null, 2));

    // Create audit log
    await AuditLog.create({
      action: 'authentication',
      resource_type: 'user',
      resource_id: details.user_id || details.email,
      tenant_id: details.tenant_id,
      details: {
        event,
        ...details,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Failed to log auth event:', error.message);
  }
};

/**
 * Ensure user exists and is synced between MongoDB and Auth0
 * This is the core resilience function
 *
 * @param {string} email - User email
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} Sync result with user data
 */
const ensureUserSync = async (email, options = {}) => {
  const {
    createIfMissing = true,
    updateAuth0 = true,
    autoVerifyEmail = true,
    unblockIfBlocked = true
  } = options;

  let syncResult = {
    status: AUTH_RESULT.SUCCESS,
    user: null,
    auth0User: null,
    actions: [],
    warnings: []
  };

  try {
    // Step 1: Check MongoDB user
    const mongoUser = await User.findOne({ email: email.toLowerCase() }).populate('role_ids');

    if (!mongoUser) {
      await logAuthEvent('USER_NOT_FOUND_IN_MONGODB', { email });
      syncResult.status = AUTH_RESULT.FAILED;
      syncResult.warnings.push('User not found in local database');
      return syncResult;
    }

    syncResult.user = mongoUser;
    await logAuthEvent('USER_FOUND_IN_MONGODB', {
      email,
      user_id: mongoUser._id,
      is_active: mongoUser.is_active
    });

    // Step 2: Check Auth0 user
    let auth0User = await auth0Service.getAuth0UserByEmail(email);

    // Step 3: Handle Auth0 user missing
    if (!auth0User && createIfMissing) {
      await logAuthEvent('USER_MISSING_IN_AUTH0_CREATING', { email, user_id: mongoUser._id });

      try {
        // Generate temporary password for sync
        const tempPassword = `Sync${Math.random().toString(36).slice(-12)}@${Date.now()}`;

        auth0User = await auth0Service.createAuth0User({
          email: mongoUser.email,
          full_name: mongoUser.full_name,
          phone: mongoUser.phone,
          password: tempPassword,
          is_active: mongoUser.is_active,
          role_ids: mongoUser.role_ids.map(r => r._id.toString()),
          _id: mongoUser._id
        });

        // Update MongoDB with Auth0 ID
        mongoUser.auth0_id = auth0User.user_id;
        await mongoUser.save();

        syncResult.status = AUTH_RESULT.CREATED_IN_AUTH0;
        syncResult.actions.push('Created user in Auth0');
        syncResult.auth0User = auth0User;

        await logAuthEvent('USER_CREATED_IN_AUTH0', {
          email,
          user_id: mongoUser._id,
          auth0_id: auth0User.user_id
        });

        // Send password reset email
        try {
          await auth0Service.sendPasswordResetEmail(email);
          syncResult.actions.push('Password reset email sent');
        } catch (resetError) {
          console.error('Failed to send password reset:', resetError.message);
          syncResult.warnings.push('Could not send password reset email');
        }
      } catch (createError) {
        await logAuthEvent('FAILED_TO_CREATE_IN_AUTH0', {
          email,
          error: createError.message
        });
        syncResult.warnings.push(`Failed to create in Auth0: ${createError.message}`);
      }
    }

    // Step 4: Sync Auth0 ID if missing in MongoDB
    if (auth0User && !mongoUser.auth0_id) {
      mongoUser.auth0_id = auth0User.user_id;
      await mongoUser.save();
      syncResult.actions.push('Synced Auth0 ID to MongoDB');
      await logAuthEvent('SYNCED_AUTH0_ID_TO_MONGODB', {
        email,
        user_id: mongoUser._id,
        auth0_id: auth0User.user_id
      });
    }

    // Step 5: Update Auth0 user data if needed
    if (auth0User && updateAuth0) {
      const updates = {};
      let needsUpdate = false;

      // Check if email verification needed
      if (autoVerifyEmail && !auth0User.email_verified) {
        updates.email_verified = true;
        needsUpdate = true;
        syncResult.actions.push('Auto-verified email in Auth0');
      }

      // Check if user is blocked but should be active
      if (unblockIfBlocked && auth0User.blocked && mongoUser.is_active) {
        updates.is_active = true;
        needsUpdate = true;
        syncResult.status = AUTH_RESULT.REACTIVATED;
        syncResult.actions.push('Unblocked user in Auth0');
      }

      // Check if metadata needs sync
      if (auth0User.name !== mongoUser.full_name) {
        updates.full_name = mongoUser.full_name;
        needsUpdate = true;
        syncResult.actions.push('Updated name in Auth0');
      }

      if (needsUpdate) {
        try {
          auth0User = await auth0Service.updateAuth0User(auth0User.user_id, updates);
          syncResult.auth0User = auth0User;
          await logAuthEvent('UPDATED_AUTH0_USER', {
            email,
            user_id: mongoUser._id,
            updates
          });
        } catch (updateError) {
          await logAuthEvent('FAILED_TO_UPDATE_AUTH0', {
            email,
            error: updateError.message
          });
          syncResult.warnings.push(`Failed to update Auth0: ${updateError.message}`);
        }
      }
    }

    // Step 6: Sync roles
    if (auth0User && mongoUser.role_ids && mongoUser.role_ids.length > 0) {
      try {
        const roleIds = mongoUser.role_ids.map(r => r._id.toString());
        await auth0Service.syncUserRoles(auth0User.user_id, roleIds);
        syncResult.actions.push('Synced roles');
      } catch (roleError) {
        console.error('Failed to sync roles:', roleError.message);
        syncResult.warnings.push('Failed to sync roles');
      }
    }

    syncResult.auth0User = auth0User;

    if (syncResult.actions.length > 0) {
      syncResult.status = AUTH_RESULT.SYNCED_AND_SUCCESS;
    }

    return syncResult;

  } catch (error) {
    await logAuthEvent('SYNC_ERROR', { email, error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Resilient login handler
 * Call this before Auth0 authentication to ensure user is synced
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} Login preparation result
 */
const prepareLogin = async (email) => {
  try {
    await logAuthEvent('LOGIN_ATTEMPT', { email });

    const syncResult = await ensureUserSync(email, {
      createIfMissing: true,
      updateAuth0: true,
      autoVerifyEmail: true,
      unblockIfBlocked: true
    });

    if (syncResult.status === AUTH_RESULT.FAILED) {
      await logAuthEvent('LOGIN_PREPARATION_FAILED', {
        email,
        warnings: syncResult.warnings
      });
      return {
        success: false,
        message: 'User not found in system',
        warnings: syncResult.warnings
      };
    }

    await logAuthEvent('LOGIN_PREPARATION_SUCCESS', {
      email,
      status: syncResult.status,
      actions: syncResult.actions
    });

    return {
      success: true,
      user: syncResult.user,
      auth0User: syncResult.auth0User,
      status: syncResult.status,
      actions: syncResult.actions,
      warnings: syncResult.warnings
    };

  } catch (error) {
    await logAuthEvent('LOGIN_PREPARATION_ERROR', { email, error: error.message });
    throw error;
  }
};

/**
 * Handle password reset request
 * Ensures user is synced before sending reset email
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} Password reset result
 */
const handlePasswordReset = async (email) => {
  try {
    await logAuthEvent('PASSWORD_RESET_REQUEST', { email });

    // Ensure user is synced
    const syncResult = await ensureUserSync(email, {
      createIfMissing: true,
      updateAuth0: true,
      autoVerifyEmail: true,
      unblockIfBlocked: true
    });

    if (syncResult.status === AUTH_RESULT.FAILED) {
      return {
        success: false,
        message: 'User not found in system'
      };
    }

    // Send password reset email
    try {
      const ticketUrl = await auth0Service.sendPasswordResetEmail(email);

      await logAuthEvent('PASSWORD_RESET_EMAIL_SENT', {
        email,
        user_id: syncResult.user._id
      });

      return {
        success: true,
        message: 'Password reset email sent',
        ticketUrl,
        actions: syncResult.actions,
        warnings: syncResult.warnings
      };
    } catch (resetError) {
      await logAuthEvent('PASSWORD_RESET_FAILED', {
        email,
        error: resetError.message
      });

      return {
        success: false,
        message: 'Failed to send password reset email',
        error: resetError.message
      };
    }

  } catch (error) {
    await logAuthEvent('PASSWORD_RESET_ERROR', { email, error: error.message });
    throw error;
  }
};

/**
 * Post-login verification and sync
 * Call this after successful Auth0 authentication
 *
 * @param {Object} auth0User - Auth0 user object
 * @returns {Promise<Object>} Post-login result
 */
const postLoginSync = async (auth0User) => {
  try {
    const email = auth0User.email;

    await logAuthEvent('POST_LOGIN_SYNC', {
      email,
      auth0_id: auth0User.user_id
    });

    // Find MongoDB user
    const mongoUser = await User.findOne({ email: email.toLowerCase() }).populate('role_ids');

    if (!mongoUser) {
      await logAuthEvent('POST_LOGIN_USER_NOT_FOUND', { email, auth0_id: auth0User.user_id });
      return {
        success: false,
        message: 'User not found in local database'
      };
    }

    // Update Auth0 ID if missing
    if (!mongoUser.auth0_id) {
      mongoUser.auth0_id = auth0User.user_id;
      await mongoUser.save();
      await logAuthEvent('POST_LOGIN_SYNCED_AUTH0_ID', {
        email,
        user_id: mongoUser._id,
        auth0_id: auth0User.user_id
      });
    }

    // Update last login time
    mongoUser.updated_at = new Date();
    await mongoUser.save();

    return {
      success: true,
      user: mongoUser,
      auth0User: auth0User
    };

  } catch (error) {
    await logAuthEvent('POST_LOGIN_SYNC_ERROR', {
      email: auth0User.email,
      error: error.message
    });
    throw error;
  }
};

/**
 * Bulk sync all users from MongoDB to Auth0
 * Useful for migration or recovery
 *
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} Bulk sync result
 */
const bulkSyncUsers = async (options = {}) => {
  const {
    tenantId = null,
    limit = null,
    dryRun = false
  } = options;

  try {
    const filter = {};
    if (tenantId) {
      filter.tenant_id = tenantId;
    }

    let query = User.find(filter).populate('role_ids');
    if (limit) {
      query = query.limit(limit);
    }

    const users = await query;

    const results = {
      total: users.length,
      synced: 0,
      created: 0,
      failed: 0,
      errors: []
    };

    for (const user of users) {
      try {
        if (!dryRun) {
          const syncResult = await ensureUserSync(user.email, {
            createIfMissing: true,
            updateAuth0: true,
            autoVerifyEmail: true,
            unblockIfBlocked: true
          });

          if (syncResult.status === AUTH_RESULT.CREATED_IN_AUTH0) {
            results.created++;
          } else if (syncResult.status !== AUTH_RESULT.FAILED) {
            results.synced++;
          } else {
            results.failed++;
          }
        } else {
          console.log(`[DRY RUN] Would sync user: ${user.email}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: user.email,
          error: error.message
        });
      }
    }

    await logAuthEvent('BULK_SYNC_COMPLETED', {
      results,
      tenant_id: tenantId,
      dry_run: dryRun
    });

    return results;

  } catch (error) {
    await logAuthEvent('BULK_SYNC_ERROR', { error: error.message });
    throw error;
  }
};

module.exports = {
  AUTH_RESULT,
  ensureUserSync,
  prepareLogin,
  handlePasswordReset,
  postLoginSync,
  bulkSyncUsers,
  logAuthEvent
};
