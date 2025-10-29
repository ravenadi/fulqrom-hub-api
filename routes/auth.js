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

const router = express.Router();

// Session configuration
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS) || 86400; // 24 hours default
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // undefined = same domain
const COOKIE_SECURE = process.env.NODE_ENV === 'production'; // HTTPS only in production
const SINGLE_SESSION = process.env.ALLOW_MULTI_SESSION !== 'true'; // Default: single session

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

    // Get request metadata
    const userAgent = req.get('user-agent');
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Session TTL (longer if remember_me)
    const ttl = req.body.remember_me ? SESSION_TTL * 7 : SESSION_TTL;

    // Create session (invalidates old sessions if single-session mode)
    const session = await UserSession.createSession({
      user_id: user._id,
      auth0_id: auth0_id || user.auth0_id,
      email: user.email,
      tenant_id: tenant_id || user.tenant_id
    }, {
      sessionId,
      csrfToken,
      userAgent,
      ipAddress,
      ttlSeconds: ttl,
      singleSession: SINGLE_SESSION
    });

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: ttl * 1000,
      domain: COOKIE_DOMAIN,
      path: '/'
    };

    res.cookie('sid', sessionId, cookieOptions);
    res.cookie('csrf', csrfToken, {
      ...cookieOptions,
      httpOnly: false // CSRF token needs to be readable by JS
    });

    // Log successful login
    console.log(`🔐 User logged in: ${user.email} (session: ${sessionId.substring(0, 8)}...)`);

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
    const currentSession = req.session;

    // Extend session expiry
    const ttl = SESSION_TTL;
    currentSession.expires_at = new Date(Date.now() + ttl * 1000);
    currentSession.last_activity = new Date();
    await currentSession.save();

    // Refresh cookies (same session ID, same CSRF for simplicity)
    const cookieOptions = {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: ttl * 1000,
      domain: COOKIE_DOMAIN,
      path: '/'
    };

    res.cookie('sid', currentSession.session_id, cookieOptions);
    res.cookie('csrf', currentSession.csrf_token, {
      ...cookieOptions,
      httpOnly: false
    });

    console.log(`🔄 Session refreshed: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Session refreshed',
      data: {
        expires_at: currentSession.expires_at
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
      sameSite: 'lax',
      domain: COOKIE_DOMAIN,
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
    const { auth0_id, email, full_name, phone, roles } = req.body;

    if (!auth0_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id and email are required'
      });
    }

    // Find or create user
    let user = await User.findOne({ auth0_id }).populate('role_ids tenant_id');

    if (!user) {
      // Create new user
      user = new User({
        auth0_id,
        email: email.toLowerCase(),
        full_name: full_name || email.split('@')[0],
        phone,
        is_active: true
      });

      // Assign roles if provided
      if (roles && roles.length > 0) {
        const Role = require('../models/Role');
        const roleObjects = await Role.find({ name: { $in: roles } });
        user.role_ids = roleObjects.map(r => r._id);
      }

      await user.save();
      user = await User.findById(user._id).populate('role_ids tenant_id');
    } else {
      // Update existing user
      user.full_name = full_name || user.full_name;
      user.phone = phone || user.phone;
      await user.save();
      user = await User.findById(user._id).populate('role_ids tenant_id');
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
        tenant_id: user.tenant_id?._id,
        tenant_name: user.tenant_id?.tenant_name,
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
 * GET /auth/user/:auth0Id
 * 
 * Get user by Auth0 ID (for fallback when sync fails)
 */
router.get('/user/:auth0Id', async (req, res) => {
  try {
    const { auth0Id } = req.params;
    const user = await User.findOne({ auth0_id: auth0Id }).populate('role_ids tenant_id');

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

module.exports = router;
