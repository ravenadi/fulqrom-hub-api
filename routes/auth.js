/**
 * Authentication Routes
 * 
 * BFF (Backend-for-Frontend) authentication endpoints.
 * Handles session creation, refresh, and logout with cookie management.
 * 
 * Routes:
 * - POST /auth/login - Create session from Auth0 token
 * - POST /auth/refresh - Refresh session and extend TTL
 * - POST /auth/logout - Invalidate session
 * - GET /auth/me - Get current user info
 */

const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const { generateCSRFToken } = require('../middleware/csrf');
const { authenticateSession, optionalSession } = require('../middleware/sessionAuth');
const { requireAuth } = require('../middleware/auth0');
const { extractDeviceInfo } = require('../utils/deviceFingerprint');

const router = express.Router();

// Session configuration
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS) || 86400; // 24 hours default
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // undefined = same domain
const COOKIE_SECURE = process.env.NODE_ENV === 'production'; // HTTPS only in production
const SINGLE_SESSION =  true ; // process.env.ALLOW_MULTI_SESSION !== 'true'; // Default: single session

/**
 * POST /auth/login
 * 
 * Server-side session creation after Auth0 authentication.
 * Client sends Auth0 token, server validates and creates session.
 * 
 * Request:
 * - Headers: Authorization: Bearer <auth0_token>
 * - Body: (optional) { remember_me: boolean }
 * 
 * Response:
 * - Sets sid (HttpOnly) and csrf cookies
 * - Returns user info
 * 
 * NOTE: This endpoint ALWAYS accepts Bearer tokens for Auth0 validation,
 * regardless of ALLOW_BEARER setting (which only affects other endpoints)
 */
router.post('/login', requireAuth[0], requireAuth[1], async (req, res) => {
  try {
    // User already validated by requireAuth middleware
    const { userId, email, auth0_id, tenant_id } = req.user;

    // Get user from database to ensure latest data
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

    // Generate session ID and CSRF token
    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = generateCSRFToken();

    // Extract comprehensive device information
    const deviceData = extractDeviceInfo(req);

    // Session TTL (longer if remember_me)
    const ttl = req.body.remember_me ? SESSION_TTL * 7 : SESSION_TTL;

    console.log(`🔐 Single-session enforcement: ${SINGLE_SESSION}`);

    // Log if single-session mode is enabled
    if (SINGLE_SESSION) {
      console.log(`🔐 Single-session enforcement: Invalidating existing session(s) for user: ${user.email}`);
      // Count existing active sessions before invalidation
      const existingSessions = await UserSession.countDocuments({
        user_id: user._id,
        is_active: true,
        expires_at: { $gt: new Date() }
      });

      if (existingSessions > 0) {
        console.log(`🔐 Single-session enforcement: Invalidating ${existingSessions} existing session(s) for user: ${user.email}`);
      }
    }

    // Create session (invalidates old sessions if single-session mode)
    const session = await UserSession.createSession({
      user_id: user._id,
      auth0_id: auth0_id || user.auth0_id,
      email: user.email,
      tenant_id: tenant_id || user.tenant_id
    }, {
      sessionId,
      csrfToken,
      ...deviceData, // Spread enhanced device data
      ttlSeconds: ttl,
      singleSession: SINGLE_SESSION
    });

    // Set cookies
    // IMPORTANT: For cross-subdomain cookies (hub.ravenlabs.biz <-> api.hub.ravenlabs.biz):
    // - Use sameSite='none' to allow cookies across subdomains
    // - Requires secure=true (HTTPS only)
    // - domain must be set to .ravenlabs.biz (with leading dot)
    // For local development (HTTP), use sameSite='lax' instead (sameSite='none' requires HTTPS)
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SECURE ? 'none' : 'lax', // 'none' for production (HTTPS), 'lax' for development (HTTP)
      maxAge: ttl * 1000,
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }), // Only set domain if explicitly configured
      path: '/'
    };

    // Debug: Log cookie options
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
      httpOnly: false // CSRF token needs to be readable by JS
    });

    // Log successful login
    console.log(`🔐 User logged in: ${user.email} (session: ${sessionId.substring(0, 8)}...)`);
    console.log(`🍪 Cookies set: sid=${sessionId.substring(0, 8)}..., csrf=${csrfToken.substring(0, 8)}...`);

    // Return user info
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
});

/**
 * POST /auth/refresh
 *
 * Refresh session and extend TTL.
 * Validates existing session and issues new cookies.
 */
router.post('/refresh', authenticateSession, async (req, res) => {
  try {
    const sessionId = req.user.session_id;

    // Extend session expiry using atomic update to avoid parallel save conflicts
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
      { new: false } // Don't return the updated document
    );

    // Refresh cookies (same session ID, same CSRF for simplicity)
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SECURE ? 'none' : 'lax', // 'none' for production (HTTPS), 'lax' for development (HTTP)
      maxAge: ttl * 1000,
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }), // Only set domain if explicitly configured
      path: '/'
    };

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
});

/**
 * GET /auth/refresh-session
 *
 * Alternative endpoint for session refresh (used by frontend).
 * Validates existing session, extends TTL, and returns user info.
 */
router.get('/refresh-session', authenticateSession, async (req, res) => {
  try {
    const sessionId = req.user.session_id;

    // Extend session expiry using atomic update to avoid parallel save conflicts
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
      { new: false } // Don't return the updated document
    );

    // Refresh cookies
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SECURE ? 'none' : 'lax', // 'none' for production (HTTPS), 'lax' for development (HTTP)
      maxAge: ttl * 1000,
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }), // Only set domain if explicitly configured
      path: '/'
    };

    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', req.session.csrf_token, {
      ...cookieOptions,
      httpOnly: false
    });

    console.log(`🔄 Session refreshed (GET): ${req.user.email}`);

    // Return user info for frontend context
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
});

/**
 * POST /auth/logout
 * 
 * Invalidate session and clear cookies.
 * NOTE: This endpoint doesn't require authentication - allows logout even with expired session
 */
router.post('/logout', async (req, res) => {
  try {
    const sessionId = req.cookies['sid'];

    // Try to invalidate session if it exists
    if (sessionId) {
      try {
        const session = await UserSession.findOne({ session_id: sessionId });
        if (session) {
          await session.invalidate('logout');
          console.log(`🚪 User logged out: ${session.user_id}`);
        }
      } catch (sessionError) {
        console.warn('Could not invalidate session:', sessionError.message);
        // Continue anyway to clear cookies
      }
    }

    // Clear cookies (must match the options used when setting them)
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SECURE ? 'none' : 'lax', // Must match the sameSite used when setting cookies
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }), // Only set domain if explicitly configured
      path: '/'
    };

    res.clearCookie('sid', cookieOptions);
    res.clearCookie('csrf', {
      ...cookieOptions,
      httpOnly: false // csrf cookie is not httpOnly
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    // Even on error, try to clear cookies
    res.clearCookie('sid', { domain: COOKIE_DOMAIN, path: '/' });
    res.clearCookie('csrf', { domain: COOKIE_DOMAIN, path: '/' });
    
    res.status(200).json({
      success: true,
      message: 'Logout completed (with errors)'
    });
  }
});

/**
 * GET /auth/me
 * 
 * Get current authenticated user information.
 * Useful for session validation and user info refresh.
 */
router.get('/me', authenticateSession, async (req, res) => {
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
});

/**
 * POST /auth/sync-user
 * 
 * Legacy endpoint for Auth0 user synchronization.
 * Creates or updates user in database from Auth0 data.
 * This is called by the frontend after Auth0 authentication.
 * 
 * NOTE: This is public (no auth required) as it's called before session creation
 */
router.post('/sync-user', async (req, res) => {
  try {
    // SECURITY: User model has autoFilter: false, so no bypass needed

    const { auth0_id, email, full_name, phone, roles } = req.body;

    if (!auth0_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id and email are required'
      });
    }

    // Check if user is super admin (from Auth0 roles or check existing roles)
    // Use v2/Role for super_admin role lookup (matches superAdmin middleware)
    const Role = require('../models/v2/Role');
    const isSuperAdmin = roles && Array.isArray(roles) && roles.includes('super_admin');

    // Also check Auth0 payload if available
    const auth0Payload = req.auth?.payload || req.auth;
    const auth0Roles = auth0Payload?.['https://fulqrom.com.au/roles'] || [];
    const isSuperAdminFromAuth0 = auth0Roles.includes('super_admin');

    // Find or create user (tenant filter already bypassed above)
    let user = await User.findOne({ auth0_id })
      .populate('role_ids tenant_id');

    // Check if existing user is super admin
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

    // Determine if this is a super admin user
    const userIsSuperAdmin = isSuperAdmin || isSuperAdminFromAuth0 || existingIsSuperAdmin;

    if (!user) {
      // Prepare user data
      const userData = {
        auth0_id,
        email: email.toLowerCase(),
        full_name: full_name || email.split('@')[0],
        phone: phone || undefined,
        is_active: true
      };

      // Super admin users don't have tenant_id (set to null explicitly)
      if (userIsSuperAdmin) {
        userData.tenant_id = null;
      }

      // Assign roles if provided
      let roleIds = [];
      if (roles && roles.length > 0) {
        // Build role query - super_admin should have tenant_id: null
        const roleQuery = { name: { $in: roles } };
        const roleObjects = await Role.find(roleQuery);
        roleIds = roleObjects.map(r => r._id);
        userData.role_ids = roleIds;
      }

      // For super admin, create without tenant validation
      if (userIsSuperAdmin) {
        // User model has autoFilter: false, so tenant filtering is not applied
        // Create using create() with skip validation
        try {
          user = await User.create([userData], {
            runValidators: false
          });
          user = user[0]; // create() returns an array
          user = await User.findById(user._id)
            .populate('role_ids tenant_id');
        } catch (createError) {
          // Fallback: use direct collection operation if create fails
          console.warn('User.create failed for super admin, using collection insert:', createError.message);
          const UserCollection = User.collection;
          const result = await UserCollection.insertOne(userData);
          user = await User.findById(result.insertedId)
            .populate('role_ids tenant_id');
        }
      } else {
        // Normal user creation with validation
        user = new User(userData);
        await user.save();
        user = await User.findById(user._id)
          .populate('role_ids tenant_id');
      }
    } else {
      // Update existing user
      const updateData = {
        full_name: full_name || user.full_name,
        phone: phone !== undefined ? phone : user.phone
      };
      
      // Ensure super admin users have tenant_id as null
      if (userIsSuperAdmin) {
        updateData.tenant_id = null;
      }
      
      // For super admin, use findOneAndUpdate to bypass validation
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
          .populate('role_ids tenant_id');
      } else {
        // Normal user update
        user.full_name = updateData.full_name;
        user.phone = updateData.phone;
        await user.save();
        user = await User.findById(user._id)
          .populate('role_ids tenant_id');
      }
    }

    // Return user data
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
});

/**
 * GET /auth/config
 *
 * Get Auth0 configuration for frontend initialization.
 * This is a public endpoint (no authentication required).
 * Returns domain, clientId, audience, and callback URL.
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      //dont send backend client only send frontend client 
      domain: process.env.FRONTEND_AUTH0_DOMAIN,
      clientId: process.env.FRONTEND_AUTH0_CLIENT_ID,
      audience: process.env.FRONTEND_AUTH0_AUDIENCE,


      callbackUrl: process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/callback` : 'http://localhost:8080/callback'
    };

    // Validate required fields
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
});

/**
 * GET /auth/user/:auth0Id
 *
 * Get user by Auth0 ID (for fallback when sync fails)
 * NOTE: This is a public endpoint, must bypass tenant filter
 */
router.get('/user/:auth0Id', async (req, res) => {
  try {
    // SECURITY: User model has autoFilter: false, so no bypass needed

    const { auth0Id } = req.params;
    const user = await User.findOne({ auth0_id: auth0Id })
      .populate('role_ids tenant_id');

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
});

/**
 * POST /auth/logout-all
 *
 * Invalidate all sessions for the current user.
 * Useful for security events or "logout from all devices".
 */
router.post('/logout-all', authenticateSession, async (req, res) => {
  try {
    const userId = req.user._id;

    // Invalidate all sessions for this user
    await UserSession.invalidateAllForUser(userId, 'logout_all');

    // Clear cookies for current session
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
});

/**
 * GET /auth/sessions
 *
 * List all active sessions for the current user.
 * Used for session management UI.
 */
router.get('/sessions', authenticateSession, async (req, res) => {
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
});

/**
 * DELETE /auth/sessions/:sessionId
 *
 * Revoke a specific session (not current session).
 * Allows users to logout from other devices.
 */
router.delete('/sessions/:sessionId', authenticateSession, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const currentSessionId = req.cookies.sid;

    // Find the session to revoke
    const session = await UserSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify session belongs to current user
    if (session.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to revoke this session'
      });
    }

    // Don't allow revoking current session (use /logout instead)
    if (session.session_id === currentSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke current session. Use /logout instead.'
      });
    }

    // Invalidate the session
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
});

module.exports = router;
