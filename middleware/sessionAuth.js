/**
 * Session Authentication Middleware
 *
 * BFF (Backend-for-Frontend) cookie-based authentication.
 * Reads session ID from HttpOnly cookie, validates against session store,
 * and attaches user to req.user.
 *
 * Replaces Bearer token authentication for browser clients.
 */

const UserSession = require('../models/UserSession');
const User = require('../models/User');

/**
 * Session authentication middleware
 * 
 * Validates session cookie and loads user data.
 * Sets req.user with authenticated user information.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function authenticateSession(req, res, next) {
  try {
    // SECURITY: User model now has autoFilter: false, so no bypass needed
    // UserSession also shouldn't need tenant filtering during auth

    // Get session ID from cookie
    const sessionId = req.cookies?.sid;

    if (!sessionId) {
      // Only log if DEBUG_LOGS is enabled to reduce noise
      if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
        console.log('❌ No session cookie found');
      }
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No session found.',
        code: 'NO_SESSION'
      });
    }

    // Find active session (includes checking is_active flag and expiry)
    const session = await UserSession.findActiveSession(sessionId);

    if (!session) {
      // Check if session exists but was invalidated (for better error messaging)
      const invalidatedSession = await UserSession.findOne({ session_id: sessionId });

      if (invalidatedSession && !invalidatedSession.is_active) {
        // Session was invalidated (likely due to new login from another device)
        const reason = invalidatedSession.invalidation_reason || 'unknown';
        console.log(`🚫 Session invalidated (${reason}): ${sessionId.substring(0, 8)}... for user ${invalidatedSession.email}`);

        // Clear cookies
        res.clearCookie('sid');
        res.clearCookie('csrf');

        // Return specific error code based on invalidation reason
        if (reason === 'new_session') {
          return res.status(401).json({
            success: false,
            message: 'You have been logged out because a new login was detected from another device or browser.',
            code: 'SESSION_REPLACED',
            reason: 'new_session'
          });
        }

        return res.status(401).json({
          success: false,
          message: 'Your session has been invalidated. Please log in again.',
          code: 'SESSION_INVALIDATED',
          reason: reason
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Invalid or expired session:', sessionId);
      }

      // Clear invalid cookie
      res.clearCookie('sid');
      res.clearCookie('csrf');

      return res.status(401).json({
        success: false,
        message: 'Session expired or invalid. Please log in again.',
        code: 'INVALID_SESSION'
      });
    }

    // Check if session is still valid (double-check expiry)
    if (!session.isValid()) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Session no longer valid:', sessionId);
      }

      res.clearCookie('sid');
      res.clearCookie('csrf');

      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED'
      });
    }

    // Get user from session (already populated)
    const user = session.user_id;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Update last activity (async, don't wait)
    session.touch().catch(err => {
      console.error('Failed to update session activity:', err);
    });

    // Attach user to request (compatible with existing auth flow)
    req.user = {
      id: user._id.toString(),
      userId: user._id.toString(),
      _id: user._id,
      auth0_id: session.auth0_id,
      email: user.email,
      full_name: user.full_name,
      role_ids: user.role_ids,
      resource_access: user.resource_access,
      is_active: user.is_active,
      tenant_id: user.tenant_id,
      // Session metadata
      session_id: session.session_id,
      session_created: session.created_at
    };

    // Attach session to request for logout/refresh operations
    req.session = session;

    // Reduce logging verbosity - only log if DEBUG_LOGS is enabled
    if (process.env.DEBUG_LOGS === 'true' && process.env.NODE_ENV === 'development') {
      console.log(`✅ Session authenticated: ${user.email}`);
    }

    next();
  } catch (error) {
    console.error('Session authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional session authentication
 * 
 * Like authenticateSession but doesn't fail if no session found.
 * Useful for endpoints that work with or without authentication.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function optionalSession(req, res, next) {
  try {
    // SECURITY: User model has autoFilter: false, so no bypass needed

    const sessionId = req.cookies?.sid;

    if (!sessionId) {
      return next();
    }

    const session = await UserSession.findActiveSession(sessionId);

    if (!session || !session.isValid()) {
      return next();
    }

    const user = session.user_id;

    if (user && user.is_active) {
      req.user = {
        id: user._id.toString(),
        userId: user._id.toString(),
        _id: user._id,
        auth0_id: session.auth0_id,
        email: user.email,
        full_name: user.full_name,
        role_ids: user.role_ids,
        resource_access: user.resource_access,
        is_active: user.is_active,
        tenant_id: user.tenant_id,
        session_id: session.session_id
      };

      req.session = session;

      // Update activity
      session.touch().catch(err => {
        console.error('Failed to update session activity:', err);
      });
    }

    next();
  } catch (error) {
    console.error('Optional session error:', error);
    // Don't fail, just continue without user
    next();
  }
}

module.exports = {
  authenticateSession,
  optionalSession
};

