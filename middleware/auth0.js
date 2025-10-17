const { auth } = require('express-oauth2-jwt-bearer');
const User = require('../models/User');

/**
 * Auth0 JWT Validation Middleware
 * Validates the JWT token from Auth0 and attaches user information to req.user
 */
const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE || process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256'
});

/**
 * Attach User Middleware
 * After JWT validation, this middleware fetches the MongoDB user
 * and attaches it to req.user for use in permission checks
 */
const attachUser = async (req, res, next) => {
  try {
    // The JWT payload is available in req.auth after checkJwt middleware
    if (!req.auth || !req.auth.sub) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user information in token.'
      });
    }

    // Auth0 user ID is in the 'sub' claim (e.g., "auth0|abc123")
    const auth0UserId = req.auth.sub;

    // Find user in MongoDB by auth0_id
    const user = await User.findOne({ auth0_id: auth0UserId })
      .populate('role_ids', 'name description permissions is_active');

    if (!user) {
      // User exists in Auth0 but not in MongoDB
      return res.status(404).json({
        success: false,
        message: 'User not found in system. Please contact administrator.',
        auth0_id: auth0UserId
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Attach user to request object for use in subsequent middleware
    req.user = {
      id: user._id.toString(),
      _id: user._id,
      auth0_id: user.auth0_id,
      email: user.email,
      full_name: user.full_name,
      role_ids: user.role_ids,
      resource_access: user.resource_access,
      is_active: user.is_active
    };

    next();
  } catch (error) {
    console.error('Error attaching user:', error);
    return res.status(500).json({
      success: false,
      message: 'Error authenticating user',
      error: error.message
    });
  }
};

/**
 * Combined Authentication Middleware
 * Validates JWT token and attaches MongoDB user to req.user
 * Use this middleware on protected routes
 */
const requireAuth = [checkJwt, attachUser];

/**
 * Conditional Authentication Middleware
 * Uses Auth0 if enabled, otherwise allows legacy authentication
 */
const conditionalAuth = async (req, res, next) => {
  const isAuth0Enabled = process.env.USE_AUTH0 === 'true';

  if (!isAuth0Enabled) {
    // Auth0 disabled - check for legacy authentication methods
    console.log('⚠️  Auth0 is disabled. Using legacy authentication.');
    console.log('📍 Request headers:', req.headers['x-user-id']);
    console.log('📍 Request query:', req.query.user_id);
    console.log('📍 Request body:', req.body?.user_id);

    // Legacy mode: accept user_id from various sources
    const userId = req.body?.user_id || req.query?.user_id || req.headers?.['x-user-id'];

    console.log('📍 Extracted userId:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide user_id in request.',
        hint: 'Add x-user-id header or user_id query parameter (Legacy mode active)'
      });
    }

    try {
      // Fetch user from database
      const user = await User.findById(userId).populate('role_ids', 'name description permissions is_active');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive'
        });
      }

      // Attach user to request
      req.user = {
        id: user._id.toString(),
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        role_ids: user.role_ids,
        resource_access: user.resource_access,
        is_active: user.is_active
      };

      return next();
    } catch (error) {
      console.error('Legacy auth error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error authenticating user',
        error: error.message
      });
    }
  }

  // Auth0 enabled - require JWT authentication
  return requireAuth[0](req, res, (err) => {
    if (err) return next(err);
    requireAuth[1](req, res, next);
  });
};

module.exports = {
  checkJwt,
  attachUser,
  requireAuth,
  conditionalAuth
};
