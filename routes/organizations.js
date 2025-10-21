const express = require('express');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const User = require('../models/User');
const { tenantContext, optionalTenantContext } = require('../middleware/tenantContext');

const router = express.Router();

/**
 * POST /api/organizations/register
 * Register a new organization (public endpoint - no auth required)
 *
 * Creates a new Tenant and its associated Organization (1-to-1).
 * Automatically creates a 14-day trial period.
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      abn,
      acn,
      phone,
      address,
      owner_email,
      owner_name,
      owner_phone,
      plan_name = 'Starter'
    } = req.body;

    // Validation
    const errors = [];

    if (!name || name.trim().length < 2) {
      errors.push('Organization name is required (minimum 2 characters)');
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Valid organization email is required');
    }

    if (!owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email)) {
      errors.push('Valid owner email is required');
    }

    if (!owner_name || owner_name.trim().length < 2) {
      errors.push('Owner name is required');
    }

    // Validate ABN if provided
    if (abn && !/^\d{11}$/.test(abn)) {
      errors.push('ABN must be exactly 11 digits');
    }

    // Validate ACN if provided
    if (acn && !/^\d{9}$/.test(acn)) {
      errors.push('ACN must be exactly 9 digits');
    }

    // Validate postcode if address provided
    if (address && address.postcode && !/^\d{4}$/.test(address.postcode)) {
      errors.push('Postcode must be 4 digits');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if organization with same email already exists
    const existingOrg = await Organization.findOne({ email: email.toLowerCase() });
    if (existingOrg) {
      return res.status(409).json({
        success: false,
        error: 'ORGANIZATION_EXISTS',
        message: 'An organization with this email already exists'
      });
    }

    // Generate unique slug from organization name
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure slug is unique
    let slugCounter = 1;
    let uniqueSlug = slug;
    while (await Organization.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${slug}-${slugCounter}`;
      slugCounter++;
    }

    // Get subscription plan
    let plan = await Plan.findOne({ name: new RegExp(`^${plan_name}$`, 'i') });

    if (!plan) {
      // Default to Starter plan if not found
      plan = await Plan.findOne({ name: /starter/i });

      if (!plan) {
        // Create default Starter plan
        plan = await Plan.create({
          name: 'Starter',
          description: 'Starter plan with basic features',
          price: 0,
          billing_period: 'monthly',
          features: {
            max_users: 5,
            max_buildings: 10,
            max_sites: 5,
            storage_gb: 10
          },
          is_active: true
        });
      }
    }

    // Create Tenant first
    const tenant = await Tenant.create({
      tenant_name: name.trim(),
      phone: phone,
      status: 'trial',
      plan_id: plan._id
    });

    // Create Organization (1-to-1 with Tenant)
    const organization = await Organization.create({
      tenant_id: tenant._id,
      name: name.trim(),
      slug: uniqueSlug,
      email: email.toLowerCase(),
      phone,
      abn,
      acn,
      address,
      plan_id: plan._id,
      status: 'trial',
      limits: {
        users: plan.features.max_users || 5,
        buildings: plan.features.max_buildings || 10,
        sites: plan.features.max_sites || 5,
        storage_gb: plan.features.storage_gb || 10
      },
      current_usage: {
        users: 1, // Owner is the first user
        buildings: 0,
        sites: 0,
        storage_bytes: 0
      },
      is_active: true
    });

    // Set owner_id on organization
    let ownerUser = await User.findOne({ email: owner_email.toLowerCase() });

    if (!ownerUser) {
      // Create new user with tenant_id
      ownerUser = await User.create({
        tenant_id: tenant._id,
        email: owner_email.toLowerCase(),
        full_name: owner_name,
        phone: owner_phone,
        is_active: true
      });
    } else {
      // Update existing user's tenant_id if not set
      if (!ownerUser.tenant_id) {
        ownerUser.tenant_id = tenant._id;
        await ownerUser.save();
      }
    }

    // Update organization with owner_id
    organization.owner_id = ownerUser._id;
    await organization.save();

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Organization registered successfully',
      data: {
        tenant: {
          id: tenant._id,
          name: tenant.tenant_name,
          status: tenant.status
        },
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organization.slug,
          email: organization.email,
          status: organization.status,
          trial_ends_at: organization.trial_ends_at,
          trial_days_remaining: organization.trial_days_remaining
        },
        owner: {
          id: ownerUser._id,
          name: ownerUser.full_name,
          email: ownerUser.email
        }
      }
    });

  } catch (error) {
    console.error('Organization registration error:', error);

    res.status(500).json({
      success: false,
      error: 'REGISTRATION_FAILED',
      message: 'Failed to register organization. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/organizations/current
 * Get current user's organization (based on tenant_id)
 *
 * Requires authentication
 */
router.get('/current', tenantContext, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'You must be logged in'
      });
    }

    // Get user's tenant_id
    const user = await User.findById(req.user.userId);
    if (!user || !user.tenant_id) {
      return res.status(404).json({
        success: false,
        error: 'NO_ORGANIZATION',
        message: 'No organization found for this user'
      });
    }

    // Get organization for this tenant
    const organization = await Organization.findOne({ tenant_id: user.tenant_id })
      .populate('tenant_id', 'tenant_name status')
      .populate('plan_id', 'name description features');

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'NO_ORGANIZATION',
        message: 'No organization found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: organization._id,
        tenant_id: organization.tenant_id._id,
        tenant_name: organization.tenant_id.tenant_name,
        name: organization.name,
        slug: organization.slug,
        email: organization.email,
        phone: organization.phone,
        abn: organization.abn,
        acn: organization.acn,
        address: organization.address,
        status: organization.status,
        branding: organization.branding,
        settings: organization.settings,
        limits: organization.limits,
        current_usage: organization.current_usage,
        trial_info: organization.status === 'trial' ? {
          trial_ends_at: organization.trial_ends_at,
          days_remaining: organization.trial_days_remaining,
          is_active: organization.is_trial_active
        } : null,
        plan: organization.plan_id ? {
          name: organization.plan_id.name,
          description: organization.plan_id.description,
          features: organization.plan_id.features
        } : null,
        created_at: organization.created_at
      }
    });

  } catch (error) {
    console.error('Get current organization error:', error);

    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: 'Failed to fetch current organization',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/organizations/:id
 * Update organization details
 *
 * Requires authentication and membership in the organization
 */
router.put('/:id', tenantContext, async (req, res) => {
  try {
    const organizationId = req.params.id;

    // Get user and verify tenant access
    const user = await User.findById(req.user.userId);
    if (!user || !user.tenant_id) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'User has no tenant association'
      });
    }

    // Find organization and verify it belongs to user's tenant
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Organization not found'
      });
    }

    if (organization.tenant_id.toString() !== user.tenant_id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You do not have permission to update this organization'
      });
    }

    const {
      name,
      phone,
      address,
      branding,
      settings
    } = req.body;

    // Build update object
    const updateData = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (branding) updateData.branding = branding;
    if (settings) updateData.settings = settings;

    // Update organization
    const updatedOrganization = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: {
        id: updatedOrganization._id,
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        email: updatedOrganization.email,
        phone: updatedOrganization.phone,
        address: updatedOrganization.address,
        branding: updatedOrganization.branding,
        settings: updatedOrganization.settings
      }
    });

  } catch (error) {
    console.error('Update organization error:', error);

    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: 'Failed to update organization',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/organizations/:id/members
 * Get all members (users) of an organization
 * Since Organization is 1-to-1 with Tenant, this returns all users with the same tenant_id
 *
 * Requires authentication and membership in the organization
 */
router.get('/:id/members', tenantContext, async (req, res) => {
  try {
    const organizationId = req.params.id;

    // Get organization
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Organization not found'
      });
    }

    // Verify user has access (same tenant)
    const user = await User.findById(req.user.userId);
    if (!user || user.tenant_id.toString() !== organization.tenant_id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You do not have permission to view this organization\'s members'
      });
    }

    // Find all users with the same tenant_id
    const members = await User.find({
      tenant_id: organization.tenant_id,
      is_active: true
    })
      .select('full_name email phone is_active created_at role_ids')
      .populate('role_ids', 'name description')
      .sort({ created_at: -1 });

    // Format response
    const formattedMembers = members.map(m => ({
      id: m._id,
      name: m.full_name,
      email: m.email,
      phone: m.phone,
      is_active: m.is_active,
      roles: m.role_ids ? m.role_ids.map(r => ({
        id: r._id,
        name: r.name,
        description: r.description
      })) : [],
      is_owner: organization.owner_id && m._id.toString() === organization.owner_id.toString(),
      joined_at: m.created_at
    }));

    res.status(200).json({
      success: true,
      count: formattedMembers.length,
      data: formattedMembers
    });

  } catch (error) {
    console.error('Get organization members error:', error);

    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: 'Failed to fetch organization members',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
