const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');
const Tenant = require('../models/Tenant');

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
 * POST /api/auth/sync-user
 * Sync or create user from Auth0 authentication
 * This endpoint is called by the frontend after Auth0 login
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

    // Check if user already exists by auth0_id
    let user = await User.findOne({ auth0_id }).populate('role_ids');

    if (!user) {
      // Check if user exists by email (might have been created before Auth0 integration)
      user = await User.findOne({ email }).populate('role_ids');

      if (user) {
        // Update existing user with auth0_id
        user.auth0_id = auth0_id;
        if (full_name) user.full_name = full_name;
        if (phone) user.phone = phone;
        user.updated_at = new Date();
        await user.save();

        // Get tenant information
        const tenantInfo = await getUserTenantInfo(user);

        return res.status(200).json({
          success: true,
          message: 'User synced with Auth0',
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
      }

      // User doesn't exist - create new user with default role
      const defaultRole = await Role.findOne({ name: 'User' });

      user = new User({
        auth0_id,
        email,
        full_name: full_name || email.split('@')[0],
        phone,
        is_active: true,
        role_ids: defaultRole ? [defaultRole._id] : [],
        resource_access: []
      });

      await user.save();
      await user.populate('role_ids');

      // Get tenant information for new user
      const tenantInfo = await getUserTenantInfo(user);

      return res.status(201).json({
        success: true,
        message: 'User created from Auth0',
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
    }

    // User exists and already has auth0_id
    // Get tenant information
    const tenantInfo = await getUserTenantInfo(user);

    return res.status(200).json({
      success: true,
      message: 'User already synced',
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
 * Change user password in Auth0
 * Requires: auth0_id, current_password, new_password
 */
router.post('/change-password', async (req, res) => {
  try {
    const { auth0_id, current_password, new_password } = req.body;

    // Validate required fields
    if (!auth0_id || !current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id, current_password, and new_password are required'
      });
    }

    // Get Auth0 user to verify current password first
    const user = await User.findOne({ auth0_id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Step 1: Verify current password by attempting to authenticate
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
          audience: process.env.AUTH0_MANAGEMENT_API_AUDIENCE || `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
          scope: 'openid profile email'
        })
      });

      // If response is not ok, current password is incorrect
      if (!verifyResponse.ok) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    } catch (verifyError) {
      // Current password is incorrect
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Step 2: Get Management API token to change password
    const managementToken = await getAuth0ManagementToken();

    // Step 3: Update password using Auth0 Management API
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
      throw new Error(errorData.message || 'Failed to update password');
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
