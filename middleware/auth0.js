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
 * For super_admin users, uses Auth0 claims directly without database lookup
 */
const attachUser = async (req, res, next) => {
  try {
    // Debug: Log what we received from JWT validation (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 attachUser: req.auth =', JSON.stringify(req.auth, null, 2));
    }

    // The JWT payload is available in req.auth.payload (express-oauth2-jwt-bearer wraps it)
    const payload = req.auth?.payload || req.auth;

    if (!payload || !payload.sub) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ attachUser: Missing payload or sub claim');
      }
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user information in token.'
      });
    }

    // Auth0 user ID is in the 'sub' claim (e.g., "auth0|abc123")
    const auth0UserId = payload.sub;
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Found auth0UserId:', auth0UserId);
    }

    // Check if user is super_admin via Auth0 claims
    const auth0Roles = payload['https://fulqrom.com.au/roles'] || [];
    if (auth0Roles.includes('super_admin')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Super admin detected via Auth0 JWT claims - checking database for user record');
      }
      
      // Even super_admin users should have a database record for consistency
      // Try to find the user in MongoDB first
      const user = await User.findOne({ auth0_id: auth0UserId })
        .populate('role_ids', 'name description permissions is_active');

      if (user) {
        // Super admin user found in database - use database record
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Super admin user found in database - using database record');
        }
        req.user = {
          id: user._id.toString(),
          userId: user._id.toString(),
          _id: user._id, // MongoDB ObjectId for database queries
          auth0_id: user.auth0_id,
          email: user.email,
          full_name: user.full_name,
          role_ids: user.role_ids,
          resource_access: user.resource_access,
          is_active: user.is_active,
          tenant_id: user.tenant_id,
          is_super_admin: true
        };
        return next();
      } else {
        // Super admin user not in database - this shouldn't happen in production
        if (process.env.NODE_ENV === 'development') {
          console.log('⚠️ Super admin user not found in database - creating fallback user object');
        }
        // Create a fallback user object with a special ID that won't cause ObjectId issues
        req.user = {
          id: 'super_admin_fallback',
          userId: 'super_admin_fallback',
          _id: 'super_admin_fallback', // Special ID that won't be used in MongoDB queries
          auth0_id: auth0UserId,
          email: payload.email || payload['https://fulqrom.com.au/email'] || '',
          full_name: payload.name || payload['https://fulqrom.com.au/name'] || 'Super Admin',
          role_ids: [{ name: 'super_admin', _id: 'super_admin' }],
          resource_access: [],
          is_active: true,
          tenant_id: null,
          is_super_admin: true
        };
        return next();
      }
    }

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
      _id: user._id, // MongoDB ObjectId for database queries
      auth0_id: user.auth0_id,
      email: user.email,
      full_name: user.full_name,
      role_ids: user.role_ids,
      resource_access: user.resource_access,
      is_active: user.is_active,
      tenant_id: user.tenant_id // Add tenant_id for tenantContext middleware
    };

    // Log login only for fresh tokens AND only for GET requests (not CRUD operations)
    // Check if token was issued recently (within last 60 seconds) = new login
    // Skip login logging for POST/PUT/PATCH/DELETE to avoid logging on create/update/delete operations
    try {
      const method = req.method;
      const isReadOperation = method === 'GET' || method === 'OPTIONS';
      
      // Only log login for read operations (GET requests), not for CRUD operations
      if (isReadOperation) {
        const payload = req.auth?.payload || req.auth;
        if (payload && payload.iat) {
          const tokenIssuedAt = payload.iat * 1000; // Convert to milliseconds
          const now = Date.now();
          const tokenAge = now - tokenIssuedAt;
          
          // If token was issued within last 60 seconds, it's a new login
          if (tokenAge < 60000) {
            const { logLogin } = require('../utils/auditLogger');
            logLogin(req, payload.iat); // Pass token IAT for better duplicate detection
          }
        }
      }
    } catch (err) {
      // Silently fail - don't break auth flow
    }

    next();
  } catch (error) {
    console.error('Error attaching user:', error.message);
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
