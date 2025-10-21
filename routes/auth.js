const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');

const router = express.Router();

/**
 * POST /api/auth/sync-user
 * Sync or create user from Auth0 authentication
 * This endpoint is called by the frontend after Auth0 login
 */
router.post('/sync-user', async (req, res) => {
  try {
    const { auth0_id, email, full_name, phone } = req.body;

    if (!auth0_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'auth0_id and email are required'
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
            resource_access: user.resource_access
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
          resource_access: user.resource_access
        }
      });
    }

    // User exists and already has auth0_id
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
        resource_access: user.resource_access
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
        resource_access: user.resource_access
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

module.exports = router;
