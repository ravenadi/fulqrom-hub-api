/**
 * Auth Controller
 * Handles all authentication-related business logic
 * Extracted from routes/auth.js as part of Phase 3 - Clean Architecture refactoring
 */

const crypto = require('crypto');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const { generateCSRFToken } = require('../middleware/csrf');
const { extractDeviceInfo } = require('../utils/deviceFingerprint');

// Session configuration
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS) || 86400; // 24 hours default
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const SINGLE_SESSION = true;

/**
 * Helper to get cookie options
 */
const getCookieOptions = (ttl) => ({
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SECURE ? 'none' : 'lax',
  maxAge: ttl * 1000,
  ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  path: '/'
});

/**
 * POST /auth/login
 * Server-side session creation after Auth0 authentication
 */
const login = async (req, res) => {
  try {
    const { userId, email, auth0_id, tenant_id } = req.user;

    const user = await User.findById(userId)
      .populate('role_ids', 'name description permissions');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = generateCSRFToken();
    const deviceData = extractDeviceInfo(req);
    const ttl = req.body.remember_me ? SESSION_TTL * 7 : SESSION_TTL;

    console.log(`🔐 Single-session enforcement: ${SINGLE_SESSION}`);

    if (SINGLE_SESSION) {
      console.log(`🔐 Single-session enforcement: Invalidating existing session(s) for user: ${user.email}`);
      const existingSessions = await UserSession.countDocuments({
        user_id: user._id,
        is_active: true,
        expires_at: { $gt: new Date() }
      });

      if (existingSessions > 0) {
        console.log(`🔐 Single-session enforcement: Invalidating ${existingSessions} existing session(s) for user: ${user.email}`);
      }
    }

    const session = await UserSession.createSession({
      user_id: user._id,
      auth0_id: auth0_id || user.auth0_id,
      email: user.email,
      tenant_id: tenant_id || user.tenant_id
    }, {
      sessionId,
      csrfToken,
      ...deviceData,
      ttlSeconds: ttl,
      singleSession: SINGLE_SESSION
    });

    const cookieOptions = getCookieOptions(ttl);

    console.log('🍪 Setting cookies with options:', {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge,
      path: cookieOptions.path
    });

    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', csrfToken, {
      ...cookieOptions,
      httpOnly: false
    });

    console.log(`🔐 User logged in: ${user.email} (session: ${sessionId.substring(0, 8)}...)`);
    console.log(`🍪 Cookies set: sid=${sessionId.substring(0, 8)}..., csrf=${csrfToken.substring(0, 8)}...`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          full_name: user.full_name,
          tenant_id: user.tenant_id,
          roles: user.role_ids,
          is_active: user.is_active
        },
        session: {
          created_at: session.created_at,
          expires_at: session.expires_at
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * POST /auth/refresh
 * Refresh session and extend TTL
 */
const refresh = async (req, res) => {
  try {
    const sessionId = req.user.session_id;
    const ttl = SESSION_TTL;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await UserSession.findOneAndUpdate(
      { session_id: sessionId },
      {
        $set: {
          expires_at: expiresAt,
          last_activity: new Date()
        }
      },
      { new: false }
    );

    const cookieOptions = getCookieOptions(ttl);

    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', req.session.csrf_token, {
      ...cookieOptions,
      httpOnly: false
    });

    console.log(`🔄 Session refreshed: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Session refreshed',
      data: {
        expires_at: expiresAt
      }
    });

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Session refresh failed',
      error: error.message
    });
  }
};

/**
 * GET /auth/refresh-session
 * Alternative endpoint for session refresh with user info
 */
const refreshSession = async (req, res) => {
  try {
    const sessionId = req.user.session_id;
    const ttl = SESSION_TTL;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await UserSession.findOneAndUpdate(
      { session_id: sessionId },
      {
        $set: {
          expires_at: expiresAt,
          last_activity: new Date()
        }
      },
      { new: false }
    );

    const cookieOptions = getCookieOptions(ttl);

    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', req.session.csrf_token, {
      ...cookieOptions,
      httpOnly: false
    });

    console.log(`🔄 Session refreshed (GET): ${req.user.email}`);

    const user = await User.findById(req.user._id)
      .populate('role_ids', 'name description permissions')
      .populate('tenant_id', 'tenant_name status');

    res.status(200).json({
      success: true,
      message: 'Session refreshed',
      user: user ? {
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        tenant_id: user.tenant_id?._id,
        tenant_name: user.tenant_id?.tenant_name,
        roles: user.role_ids,
        resource_access: user.resource_access,
        document_categories: user.document_categories,
        engineering_disciplines: user.engineering_disciplines
      } : null,
      data: {
        expires_at: expiresAt
      }
    });

  } catch (error) {
    console.error('Refresh session error:', error);
    res.status(500).json({
      success: false,
      message: 'Session refresh failed',
      error: error.message
    });
  }
};

/**
 * POST /auth/logout
 * Invalidate session and clear cookies
 */
const logout = async (req, res) => {
  try {
    const sessionId = req.cookies['sid'];

    if (sessionId) {
      try {
        const session = await UserSession.findOne({ session_id: sessionId });
        if (session) {
          await session.invalidate('logout');
          console.log(`🚪 User logged out: ${session.user_id}`);
        }
      } catch (sessionError) {
        console.warn('Could not invalidate session:', sessionError.message);
      }
    }

    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SECURE ? 'none' : 'lax',
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
      path: '/'
    };

    res.clearCookie('sid', cookieOptions);
    res.clearCookie('csrf', {
      ...cookieOptions,
      httpOnly: false
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('sid', { domain: COOKIE_DOMAIN, path: '/' });
    res.clearCookie('csrf', { domain: COOKIE_DOMAIN, path: '/' });

    res.status(200).json({
      success: true,
      message: 'Logout completed (with errors)'
    });
  }
};

/**
 * GET /auth/me
 * Get current authenticated user information
 */
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('role_ids', 'name description permissions')
      .populate('tenant_id', 'tenant_name status');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        tenant_id: user.tenant_id,
        roles: user.role_ids,
        resource_access: user.resource_access,
        is_active: user.is_active,
        session: {
          session_id: req.user.session_id,
          created_at: req.user.session_created
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info',
      error: error.message
    });
  }
};

/**
 * POST /auth/sync-user
 * Legacy endpoint for Auth0 user synchronization
 */
const syncUser = async (req, res) => {
  try {
    const { auth0_id, email, full_name, phone, roles } = req.body;

    if (!auth0_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id and email are required'
      });
    }

    const Role = require('../models/v2/Role');
    const isSuperAdmin = roles && Array.isArray(roles) && roles.includes('super_admin');

    const auth0Payload = req.auth?.payload || req.auth;
    const auth0Roles = auth0Payload?.['https://fulqrom.com.au/roles'] || [];
    const isSuperAdminFromAuth0 = auth0Roles.includes('super_admin');

    let user = await User.findOne({ auth0_id })
      .populate('role_ids', 'name description permissions')
      .populate('tenant_id');

    let existingIsSuperAdmin = false;
    if (user && user.role_ids && user.role_ids.length > 0) {
      const superAdminRole = await Role.findOne({
        name: 'super_admin',
        tenant_id: null
      });

      if (superAdminRole) {
        existingIsSuperAdmin = user.role_ids.some(
          role => role._id?.toString() === superAdminRole._id.toString() ||
                  role.toString() === superAdminRole._id.toString()
        );
      }
    }

    const userIsSuperAdmin = isSuperAdmin || isSuperAdminFromAuth0 || existingIsSuperAdmin;

    if (!user) {
      const userData = {
        auth0_id,
        email: email.toLowerCase(),
        full_name: full_name || email.split('@')[0],
        phone: phone || undefined,
        is_active: true
      };

      if (userIsSuperAdmin) {
        userData.tenant_id = null;
      }

      let roleIds = [];
      if (roles && roles.length > 0) {
        const roleQuery = { name: { $in: roles } };
        const roleObjects = await Role.find(roleQuery);
        roleIds = roleObjects.map(r => r._id);
        userData.role_ids = roleIds;
      }

      if (userIsSuperAdmin) {
        try {
          user = await User.create([userData], {
            runValidators: false
          });
          user = user[0];
          user = await User.findById(user._id)
            .populate('role_ids', 'name description permissions')
            .populate('tenant_id');
        } catch (createError) {
          console.warn('User.create failed for super admin, using collection insert:', createError.message);
          const UserCollection = User.collection;
          const result = await UserCollection.insertOne(userData);
          user = await User.findById(result.insertedId)
            .populate('role_ids', 'name description permissions')
            .populate('tenant_id');
        }
      } else {
        user = new User(userData);
        await user.save();
        user = await User.findById(user._id)
          .populate('role_ids', 'name description permissions')
          .populate('tenant_id');
      }
    } else {
      const updateData = {
        full_name: full_name || user.full_name,
        phone: phone !== undefined ? phone : user.phone
      };

      if (userIsSuperAdmin) {
        updateData.tenant_id = null;
      }

      if (userIsSuperAdmin) {
        user = await User.findOneAndUpdate(
          { _id: user._id },
          { $set: updateData },
          {
            new: true,
            runValidators: false,
            setDefaultsOnInsert: false
          }
        )
          .populate('role_ids', 'name description permissions')
          .populate('tenant_id');
      } else {
        user.full_name = updateData.full_name;
        user.phone = updateData.phone;
        await user.save();
        user = await User.findById(user._id)
          .populate('role_ids', 'name description permissions')
          .populate('tenant_id');
      }
    }

    // Create session and set cookies (BFF authentication)
    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = generateCSRFToken();
    const deviceData = extractDeviceInfo(req);
    const ttl = SESSION_TTL;

    // Create session with single-session enforcement
    const session = await UserSession.createSession({
      user_id: user._id,
      auth0_id: user.auth0_id,
      email: user.email,
      tenant_id: user.tenant_id?._id || user.tenant_id || null
    }, {
      sessionId,
      csrfToken,
      ...deviceData,
      ttlSeconds: ttl,
      singleSession: SINGLE_SESSION
    });

    // Set cookies
    const cookieOptions = getCookieOptions(ttl);
    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', csrfToken, { ...cookieOptions, httpOnly: false });

    console.log(`🔐 Session created for synced user: ${user.email} (session: ${sessionId.substring(0, 8)}...)`);

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        auth0_id: user.auth0_id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        tenant_id: user.tenant_id?._id || user.tenant_id || null,
        tenant_name: user.tenant_id?.tenant_name || null,
        role_ids: user.role_ids,
        resource_access: user.resource_access || [],
        document_categories: user.document_categories || [],
        engineering_disciplines: user.engineering_disciplines || []
      }
    });
  } catch (error) {
    console.error('Sync user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync user',
      error: error.message
    });
  }
};

/**
 * GET /auth/config
 * Get Auth0 configuration for frontend initialization
 */
const getConfig = (req, res) => {
  try {
    const config = {
      domain: process.env.FRONTEND_AUTH0_DOMAIN,
      clientId: process.env.FRONTEND_AUTH0_CLIENT_ID,
      audience: process.env.FRONTEND_AUTH0_AUDIENCE,
      callbackUrl: process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/callback` : 'http://localhost:8080/callback'
    };

    if (!config.domain || !config.clientId) {
      console.error('❌ Missing required Auth0 configuration in backend .env');
      return res.status(500).json({
        success: false,
        message: 'Auth0 configuration is incomplete on server'
      });
    }

    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get Auth0 config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Auth0 configuration',
      error: error.message
    });
  }
};

/**
 * GET /auth/user/:auth0Id
 * Get user by Auth0 ID
 */
const getUserByAuth0Id = async (req, res) => {
  try {
    const { auth0Id } = req.params;
    const user = await User.findOne({ auth0_id: auth0Id })
      .populate('role_ids', 'name description permissions')
      .populate('tenant_id');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        auth0_id: user.auth0_id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        tenant_id: user.tenant_id?._id,
        tenant_name: user.tenant_id?.tenant_name,
        role_ids: user.role_ids,
        resource_access: user.resource_access || [],
        document_categories: user.document_categories || [],
        engineering_disciplines: user.engineering_disciplines || []
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: error.message
    });
  }
};

/**
 * POST /auth/logout-all
 * Invalidate all sessions for the current user
 */
const logoutAll = async (req, res) => {
  try {
    const userId = req.user._id;

    await UserSession.invalidateAllForUser(userId, 'logout_all');

    res.clearCookie('sid', {
      domain: COOKIE_DOMAIN,
      path: '/'
    });
    res.clearCookie('csrf', {
      domain: COOKIE_DOMAIN,
      path: '/'
    });

    console.log(`🚪🔒 All sessions invalidated for user: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'All sessions have been logged out'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout all sessions',
      error: error.message
    });
  }
};

/**
 * GET /auth/sessions
 * List all active sessions for the current user
 */
const getSessions = async (req, res) => {
  try {
    const sessions = await UserSession.find({
      user_id: req.user._id,
      is_active: true,
      expires_at: { $gt: new Date() }
    }).sort({ last_activity: -1 });

    const currentSessionId = req.cookies.sid;

    const sessionsWithCurrent = sessions.map(session => ({
      id: session._id.toString(),
      session_name: session.session_name ||
        `${session.device_info?.device_type || 'Unknown'} - ${session.device_info?.browser || 'Unknown'}`,
      device_info: session.device_info || {},
      ip_address: session.ip_address,
      geolocation: session.geolocation,
      created_at: session.created_at,
      last_activity: session.last_activity,
      expires_at: session.expires_at,
      is_current: session.session_id === currentSessionId
    }));

    res.json({
      success: true,
      data: sessionsWithCurrent
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sessions',
      error: error.message
    });
  }
};

/**
 * DELETE /auth/sessions/:sessionId
 * Revoke a specific session
 */
const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const currentSessionId = req.cookies.sid;

    const session = await UserSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    if (session.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to revoke this session'
      });
    }

    if (session.session_id === currentSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke current session. Use /logout instead.'
      });
    }

    await session.invalidate('revoked_by_user');

    console.log(`🔒 Session revoked by user: ${req.user.email} (session: ${sessionId})`);

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke session',
      error: error.message
    });
  }
};

/**
 * POST /auth/change-password
 * Change user password
 */
const changePassword = async (req, res) => {
  try {
    const { auth0_id, current_password, new_password, skip_verification } = req.body;

    if (!auth0_id || !current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id, current_password, and new_password are required'
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.auth0_id !== auth0_id) {
      return res.status(403).json({
        success: false,
        message: 'You can only change your own password'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    if (skip_verification === true) {
      console.log(`⚠️ Skipping password verification for user: ${user.email} (skip_verification=true)`);
      console.log(`✅ User authenticated with valid Bearer token, proceeding with password change`);
    } else {
      console.log(`🔐 Verifying current password for user: ${user.email}`);

      try {
        const verifyResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grant_type: 'password',
            username: user.email,
            password: current_password,
            client_id: process.env.AUTH0_CLIENT_ID,
            client_secret: process.env.AUTH0_CLIENT_SECRET,
            audience: process.env.AUTH0_AUDIENCE,
            scope: 'openid profile email'
          })
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json().catch(() => ({}));

          console.log('🔍 Auth0 password verification response:', {
            status: verifyResponse.status,
            error: errorData.error,
            error_description: errorData.error_description,
            full_response: errorData
          });

          if (errorData.error === 'unauthorized_client' ||
              errorData.error === 'access_denied' ||
              errorData.error === 'unsupported_grant_type' ||
              errorData.error_description?.toLowerCase().includes('grant') ||
              errorData.error_description?.toLowerCase().includes('not allowed') ||
              errorData.error_description?.toLowerCase().includes('disabled')) {
            console.warn('⚠️ Password grant type not enabled in Auth0, skipping password verification');
            console.log('✅ Using authenticated session as verification (user already logged in with valid Bearer token)');
          } else if (errorData.error === 'invalid_grant' ||
                     errorData.error_description?.toLowerCase().includes('wrong') ||
                     errorData.error_description?.toLowerCase().includes('invalid')) {
            console.error('❌ Current password verification failed - password is incorrect');
            return res.status(401).json({
              success: false,
              message: 'Current password is incorrect',
              code: 'INVALID_CURRENT_PASSWORD',
              details: errorData.error_description
            });
          } else {
            console.warn('⚠️ Unknown Auth0 error during password verification:', errorData);
            console.log('✅ Continuing anyway since user has valid Bearer token');
          }
        } else {
          console.log(`✅ Current password verified for user: ${user.email}`);
        }
      } catch (verifyError) {
        console.error('Password verification error:', verifyError);
        console.warn('⚠️ Could not verify password via Auth0, continuing with authenticated session');
      }
    }

    console.log(`🔐 Updating password for user: ${user.email}`);

    try {
      const tokenResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: process.env.AUTH0_CLIENT_ID,
          client_secret: process.env.AUTH0_CLIENT_SECRET,
          audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`
        })
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.json().catch(() => ({}));
        console.error('Failed to get Management API token:', tokenError);
        throw new Error('Failed to authenticate with Auth0');
      }

      const { access_token } = await tokenResponse.json();

      const updateResponse = await fetch(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${auth0_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            password: new_password,
            connection: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication'
          })
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        console.error('Password update failed:', errorData);

        if (errorData.message?.includes('PasswordStrengthError') ||
            errorData.message?.includes('Password is too weak')) {
          return res.status(400).json({
            success: false,
            message: 'Password does not meet strength requirements. Please use a stronger password.',
            code: 'PASSWORD_TOO_WEAK'
          });
        }

        throw new Error(errorData.message || 'Failed to update password');
      }

      console.log(`✅ Password updated successfully for user: ${user.email}`);

      const emailService = require('../utils/emailService');
      try {
        await emailService.sendPasswordChangeConfirmation({
          to: user.email,
          userName: user.full_name || user.email.split('@')[0]
        });
        console.log(`📧 Password change confirmation email sent to: ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send password change confirmation email:', emailError);
      }

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (updateError) {
      console.error('Password update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update password',
        error: updateError.message
      });
    }

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

module.exports = {
  login,
  refresh,
  refreshSession,
  logout,
  getCurrentUser,
  syncUser,
  getConfig,
  getUserByAuth0Id,
  logoutAll,
  getSessions,
  revokeSession,
  changePassword
};
