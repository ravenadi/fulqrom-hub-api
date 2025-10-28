const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');
const Tenant = require('../models/Tenant');
const resilientAuthService = require('../services/resilientAuthService');

const router = express.Router();

// Auth0 Management API token cache
let auth0ManagementToken = null;
let tokenExpiresAt = 0;

/**
 * Helper function to get Auth0 Management API access token
 */
async function getAuth0ManagementToken() {
  // Return cached token if still valid
  if (auth0ManagementToken && Date.now() < tokenExpiresAt) {
    return auth0ManagementToken;
  }

  try {
    const response = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: process.env.AUTH0_MANAGEMENT_API_AUDIENCE || `https://${process.env.AUTH0_DOMAIN}/api/v2/`
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error_description || errorData.message || 'Failed to get token');
    }

    const data = await response.json();
    auth0ManagementToken = data.access_token;
    // Set expiry to 1 hour from now (tokens typically last 24 hours, but we refresh earlier)
    tokenExpiresAt = Date.now() + (60 * 60 * 1000);

    return auth0ManagementToken;
  } catch (error) {
    console.error('Failed to get Auth0 Management API token:', error.message);
    throw new Error('Failed to authenticate with Auth0 Management API');
  }
}

/**
 * Helper function to set or update user password in Auth0
 * Uses Management API to set password (works with M2M applications)
 */
async function setAuth0Password(auth0_id, password) {
  try {
    // Validate password length
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Get Management API token
    const managementToken = await getAuth0ManagementToken();

    // Update password using Auth0 Management API
    const updateResponse = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${auth0_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${managementToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: password,
          connection: process.env.AUTH0_CONNECTION || 'Username-Password-Authentication'
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.description || 'Failed to update password';
      
      // Handle specific Auth0 errors
      if (errorMessage.includes('PasswordStrengthError') || 
          errorMessage.includes('Password is too weak')) {
        throw new Error('Password does not meet Auth0 password strength requirements');
      }
      
      throw new Error(errorMessage);
    }

    return { success: true, message: 'Password set successfully' };
  } catch (error) {
    console.error('Auth0 password update error:', error.message);
    throw error;
  }
}

/**
 * Helper function to get tenant/organization information for a user
 */
async function getUserTenantInfo(user) {
  try {
    // If user has tenant_id, fetch the tenant info
    if (user.tenant_id) {
      const tenant = await Tenant.findById(user.tenant_id).lean();

      if (tenant) {
        return {
          tenant_id: user.tenant_id.toString(),
          tenant_name: tenant.tenant_name || tenant.display_name || 'Unknown Tenant',
          organisation: {
            organisation_id: tenant._id.toString(),
            name: tenant.tenant_name || tenant.display_name || 'Unknown Tenant',
            is_primary: true
          }
        };
      }
    }

    // No tenant information available
    return {
      tenant_id: null,
      tenant_name: null,
      organisation: null
    };
  } catch (error) {
    console.error('Error fetching tenant info:', error);
    return {
      tenant_id: null,
      tenant_name: null,
      organisation: null
    };
  }
}

/**
 * POST /api/auth/prepare-login
 * RESILIENT: Prepare user for login by ensuring MongoDB/Auth0 sync
 * Call this BEFORE Auth0 login to ensure user can authenticate
 */
router.post('/prepare-login', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Use resilient service to prepare login
    const result = await resilientAuthService.prepareLogin(email);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message,
        warnings: result.warnings
      });
    }

    // Return success with sync actions performed
    return res.status(200).json({
      success: true,
      message: 'User prepared for login',
      actions: result.actions,
      warnings: result.warnings,
      status: result.status
    });

  } catch (error) {
    console.error('Login preparation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error preparing login',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/password-reset
 * RESILIENT: Request password reset with auto-sync
 * Ensures user is synced before sending reset email
 */
router.post('/password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Use resilient service to handle password reset
    const result = await resilientAuthService.handlePasswordReset(email);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      actions: result.actions,
      warnings: result.warnings
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing password reset',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/sync-user
 * RESILIENT: Sync or create user from Auth0 authentication
 * This endpoint is called by the frontend after Auth0 login
 * Now uses resilient post-login sync
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

    // Check if user is a super_admin (only exists in Auth0, not in database)
    if (roles && Array.isArray(roles) && roles.includes('super_admin')) {
      return res.status(200).json({
        success: true,
        message: 'Super admin authenticated via Auth0 only',
        data: {
          id: auth0_id,
          _id: auth0_id,
          email: email,
          full_name: full_name || email.split('@')[0],
          phone: phone,
          auth0_id: auth0_id,
          is_active: true,
          role_ids: [{ name: 'super_admin', _id: 'super_admin' }],
          role_name: 'super_admin',
          resource_access: [],
          tenant_id: null,
          tenant_name: null,
          organisations: [],
          is_super_admin: true
        }
      });
    }

    // Use resilient post-login sync
    const syncResult = await resilientAuthService.postLoginSync({
      user_id: auth0_id,
      email: email,
      name: full_name,
      phone: phone
    });

    if (!syncResult.success) {
      // User not found in MongoDB - this shouldn't happen if prepare-login was called
      return res.status(404).json({
        success: false,
        message: syncResult.message
      });
    }

    let user = syncResult.user;

    // Ensure roles are populated with permissions
    // Check if roles need to be populated or if permissions are missing
    const hasRoles = user.role_ids && user.role_ids.length > 0;
    const rolesNeedPopulation = !hasRoles || 
                                (hasRoles && user.role_ids[0] && 
                                 typeof user.role_ids[0] === 'object' && 
                                 user.role_ids[0].permissions === undefined);
    
    if (rolesNeedPopulation) {
      // Re-fetch user with populated roles
      const populatedUser = await User.findById(user._id || user.id)
        .populate('role_ids', 'name description permissions is_active');
      if (populatedUser) {
        user = populatedUser.toObject ? populatedUser.toObject() : populatedUser;
      }
    }

    // Get tenant information
    const tenantInfo = await getUserTenantInfo(user);

    // NOTE: Login logging is now handled in auth0.js middleware by checking token age
    // This endpoint is called on every page refresh, so we don't log here

    return res.status(200).json({
      success: true,
      message: 'User synced successfully',
      data: {
        _id: user._id.toString(),
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        auth0_id: user.auth0_id,
        is_active: user.is_active,
        role_ids: user.role_ids,
        role_name: user.role_ids && user.role_ids.length > 0 ? user.role_ids[0].name : 'User',
        resource_access: user.resource_access || [],
        tenant_id: tenantInfo.tenant_id,
        tenant_name: tenantInfo.tenant_name,
        organisations: tenantInfo.organisation ? [tenantInfo.organisation] : []
      }
    });

  } catch (error) {
    console.error('User sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error syncing user',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/user/:auth0_id
 * Get user by Auth0 ID
 */
router.get('/user/:auth0_id', async (req, res) => {
  try {
    const { auth0_id } = req.params;

    const user = await User.findOne({ auth0_id }).populate('role_ids');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get tenant information
    const tenantInfo = await getUserTenantInfo(user);

    res.status(200).json({
      success: true,
      data: {
        _id: user._id.toString(),
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        auth0_id: user.auth0_id,
        is_active: user.is_active,
        role_ids: user.role_ids,
        role_name: user.role_ids && user.role_ids.length > 0 ? user.role_ids[0].name : 'User',
        resource_access: user.resource_access,
        tenant_id: tenantInfo.tenant_id,
        tenant_name: tenantInfo.tenant_name,
        organisations: tenantInfo.organisation ? [tenantInfo.organisation] : []
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password in Auth0 using Management API
 * Note: Password verification is optional and may not work with M2M applications.
 * If password grant is not enabled, verification is skipped but password is still changed.
 * The user must be authenticated via bearer token (already provided in request).
 * 
 * Requires: auth0_id, new_password
 * Optional: current_password (for verification if password grant is enabled)
 */
router.post('/change-password', async (req, res) => {
  try {
    const { auth0_id, current_password, new_password } = req.body;

    // Validate required fields
    if (!auth0_id || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id and new_password are required'
      });
    }

    // Ensure new password is different from current password (if provided)
    if (current_password && current_password === new_password) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Validate new password meets requirements
    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get Auth0 user to verify email and get connection info
    const user = await User.findOne({ auth0_id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Optional: Verify current password if provided
    // Note: Password grant verification may not work with M2M applications
    // Only reject if we get a clear "wrong password" error
    if (current_password) {
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
            audience: process.env.AUTH0_AUDIENCE || process.env.AUTH0_CLIENT_ID,
            scope: 'openid profile email'
          })
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json().catch(() => ({}));
          const errorCode = String(errorData.error || errorData.error_description || '').toLowerCase();
          
          // Only reject on clearly wrong password errors
          // Skip verification for grant type issues or configuration problems
          if (errorCode.includes('invalid_user_password') || 
              errorCode.includes('wrong email or password') ||
              (errorCode.includes('access_denied') && errorCode.includes('password'))) {
            return res.status(401).json({
              success: false,
              message: 'Current password is incorrect'
            });
          }
          
          // For any other error (grant type not enabled, wrong audience, etc.), skip verification
          console.warn('Password verification skipped:', errorCode || 'unknown error');
        }
      } catch (verifyError) {
        // Network errors or other issues - skip verification
        console.warn('Password verification unavailable, proceeding without verification');
      }
    }

    // Get Management API token to change password
    const managementToken = await getAuth0ManagementToken();

    // Update password using Auth0 Management API
    const updateResponse = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${auth0_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${managementToken}`,
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
      const errorMessage = errorData.message || errorData.description || 'Failed to update password';
      
      // Handle specific Auth0 errors
      if (errorMessage.includes('PasswordStrengthError') || 
          errorMessage.includes('Password is too weak')) {
        return res.status(400).json({
          success: false,
          message: 'New password does not meet Auth0 password strength requirements'
        });
      }
      
      if (errorMessage.includes('same as the previous password')) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from your current password'
        });
      }
      
      console.error('Password update error:', errorData);
      return res.status(400).json({
        success: false,
        message: errorMessage
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error.message);

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to change password'
    });
  }
});

module.exports = router;
