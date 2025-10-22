const { auth } = require('express-oauth2-jwt-bearer');
const User = require('../models/User');

/**
 * Auth0 JWT Validation Middleware
 * Validates the JWT token from Auth0 and attaches user information to req.user
 */
const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE || process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256',
  // Allow tokens with multiple audiences (e.g., API + userinfo endpoint)
  strictAudience: false,
  // Don't require Authorization header to be present in request body parsing
  // This fixes issues with multipart/form-data uploads
  credentialsRequired: true
});

/**
 * Attach User Middleware
 * After JWT validation, this middleware fetches the MongoDB user
 * and attaches it to req.user for use in permission checks
 */
const attachUser = async (req, res, next) => {
  try {
    // Debug: Log what we received from JWT validation
    console.log('📋 attachUser: req.auth =', JSON.stringify(req.auth, null, 2));

    // The JWT payload is available in req.auth.payload (express-oauth2-jwt-bearer wraps it)
    const payload = req.auth?.payload || req.auth;

    if (!payload || !payload.sub) {
      console.log('❌ attachUser: Missing payload or sub claim');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user information in token.'
      });
    }

    // Auth0 user ID is in the 'sub' claim (e.g., "auth0|abc123")
    const auth0UserId = payload.sub;
    console.log('✅ Found auth0UserId:', auth0UserId);

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
      userId: user._id.toString(), // Add userId for tenantContext compatibility
      _id: user._id,
      auth0_id: user.auth0_id,
      email: user.email,
      full_name: user.full_name,
      role_ids: user.role_ids,
      resource_access: user.resource_access,
      is_active: user.is_active,
      tenant_id: user.tenant_id // Add tenant_id for tenantContext middleware
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

module.exports = {
  checkJwt,
  attachUser,
  requireAuth
};
