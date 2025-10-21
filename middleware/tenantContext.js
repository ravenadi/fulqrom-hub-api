/**
 * Tenant Context Middleware
 *
 * This middleware extracts tenant information from the authenticated user
 * and attaches it to the request object for use throughout the application.
 *
 * IMPORTANT: This middleware MUST be placed AFTER authentication middleware
 * in the middleware chain, as it depends on req.user being populated.
 *
 * The middleware:
 * 1. Gets the user's tenant_id from their User record
 * 2. Looks up the organization for that tenant (1-to-1 relationship)
 * 3. Validates the organization is active
 * 4. Attaches tenant context to req.tenant
 * 5. Makes tenant information available for database queries
 */

const User = require('../models/User');
const Organization = require('../models/Organization');
const Tenant = require('../models/Tenant');

/**
 * Tenant context middleware
 *
 * Extracts and validates tenant information from the authenticated user.
 * Attaches tenant context to req.tenant for use in routes and controllers.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function tenantContext(req, res, next) {
  try {
    // Skip tenant resolution for routes that don't require it
    // (e.g., health checks, public endpoints)
    if (req.path === '/health' || req.path === '/') {
      return next();
    }

    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      // If no authenticated user, skip tenant resolution
      // (authentication middleware will handle auth errors)
      return next();
    }

    const userId = req.user.userId;

    // Check if this is a super admin user
    // Super admins can bypass tenant context or switch tenants via header
    const isSuperAdmin = req.user.isSuperAdmin || false;

    // Allow super admins to bypass tenant context with a special header
    if (isSuperAdmin && req.headers['x-bypass-tenant']) {
      req.tenant = {
        tenantId: null,
        tenantSlug: null,
        organization: null,
        tenant: null,
        isSuperAdmin: true,
        bypassTenant: true
      };
      return next();
    }

    // Get user from database to retrieve tenant_id
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    if (!user.tenant_id) {
      return res.status(403).json({
        success: false,
        error: 'NO_TENANT',
        message: 'User is not associated with any tenant. Please contact your administrator.',
        requiresOnboarding: true
      });
    }

    // Allow super admins to impersonate a tenant via header
    let targetTenantId = user.tenant_id;
    if (isSuperAdmin && req.headers['x-tenant-id']) {
      targetTenantId = req.headers['x-tenant-id'];
    }

    // Get tenant
    const tenant = await Tenant.findById(targetTenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Tenant not found'
      });
    }

    // Get organization for this tenant (1-to-1 relationship)
    const organization = await Organization.findOne({ tenant_id: targetTenantId })
      .populate('plan_id', 'name description features');

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'NO_ORGANIZATION',
        message: 'No organization found for this tenant. Please contact your administrator.'
      });
    }

    // Validate organization is active
    if (!organization.is_active) {
      return res.status(403).json({
        success: false,
        error: 'ORGANIZATION_INACTIVE',
        message: 'Your organization has been deactivated. Please contact support.',
        organizationStatus: organization.status
      });
    }

    // Check if organization trial has expired
    if (organization.status === 'trial' && !organization.is_trial_active) {
      return res.status(403).json({
        success: false,
        error: 'TRIAL_EXPIRED',
        message: 'Your trial period has expired. Please upgrade your subscription to continue.',
        trialEndedAt: organization.trial_ends_at,
        requiresUpgrade: true
      });
    }

    // Check if organization is suspended
    if (organization.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'ORGANIZATION_SUSPENDED',
        message: 'Your organization account has been suspended. Please contact support to resolve this issue.',
        suspensionReason: organization.suspension_reason || 'Not specified'
      });
    }

    // Check if organization is cancelled
    if (organization.status === 'cancelled') {
      return res.status(403).json({
        success: false,
        error: 'ORGANIZATION_CANCELLED',
        message: 'Your organization account has been cancelled and is no longer accessible.',
        cancellationDate: organization.updated_at
      });
    }

    // Attach tenant context to request
    req.tenant = {
      // Core tenant identifiers
      tenantId: tenant._id,
      organizationId: organization._id,
      tenantSlug: organization.slug,

      // Full objects
      tenant: tenant,
      organization: organization,

      // User information
      userId: user._id,
      userEmail: user.email,
      userRoleIds: user.role_ids || [],

      // Admin flags
      isSuperAdmin: isSuperAdmin,
      isImpersonating: isSuperAdmin && !!req.headers['x-tenant-id'],
      isOwner: organization.owner_id && user._id.toString() === organization.owner_id.toString(),

      // Organization status and limits
      organizationStatus: organization.status,
      tenantStatus: tenant.status,
      isTrialActive: organization.is_trial_active,
      trialDaysRemaining: organization.trial_days_remaining,
      limits: organization.limits,
      currentUsage: organization.current_usage,

      // Helper methods
      canAddUsers: (count = 1) => organization.canAddUsers(count),
      canAddBuildings: (count = 1) => organization.canAddBuildings(count),
      canAddSites: (count = 1) => organization.canAddSites(count),
      canAddStorage: (bytes) => organization.canAddStorage(bytes)
    };

    // Also attach to res.locals for use in views/templates
    res.locals.tenant = req.tenant;

    next();
  } catch (error) {
    console.error('Tenant context middleware error:', error);

    return res.status(500).json({
      success: false,
      error: 'TENANT_CONTEXT_ERROR',
      message: 'Failed to load tenant context. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Optional tenant context middleware
 *
 * Similar to tenantContext but doesn't fail if no organization is found.
 * Useful for routes that work with or without a tenant context.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function optionalTenantContext(req, res, next) {
  try {
    // Skip tenant resolution for routes that don't require it
    if (req.path === '/health' || req.path === '/') {
      return next();
    }

    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      req.tenant = null;
      return next();
    }

    const userId = req.user.userId;

    // Get user from database
    const user = await User.findById(userId);

    if (!user || !user.tenant_id) {
      req.tenant = null;
      return next();
    }

    // Get tenant and organization
    const tenant = await Tenant.findById(user.tenant_id);
    const organization = await Organization.findOne({ tenant_id: user.tenant_id })
      .populate('plan_id', 'name description features');

    if (!tenant || !organization) {
      req.tenant = null;
      return next();
    }

    // Attach tenant context (minimal validation)
    req.tenant = {
      tenantId: tenant._id,
      organizationId: organization._id,
      tenantSlug: organization.slug,
      tenant: tenant,
      organization: organization,
      userId: user._id,
      userEmail: user.email,
      organizationStatus: organization.status,
      tenantStatus: tenant.status
    };

    res.locals.tenant = req.tenant;
    next();
  } catch (error) {
    // If tenant resolution fails, continue without tenant context
    req.tenant = null;
    next();
  }
}

/**
 * Middleware to require a valid tenant context
 *
 * Use this middleware on routes that absolutely require tenant context.
 * If tenant context is not available, returns 403 error.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requireTenantContext(req, res, next) {
  if (!req.tenant || !req.tenant.tenantId) {
    return res.status(403).json({
      success: false,
      error: 'TENANT_REQUIRED',
      message: 'This operation requires a valid tenant context.'
    });
  }
  next();
}

/**
 * Middleware to check tenant usage limits
 *
 * @param {string} limitType - The type of limit to check ('users', 'buildings', 'sites', 'storage')
 * @param {number} count - The count to check against the limit (default: 1)
 * @returns {Function} Express middleware function
 */
function checkTenantLimit(limitType, count = 1) {
  return (req, res, next) => {
    if (!req.tenant || !req.tenant.organization) {
      return res.status(403).json({
        success: false,
        error: 'TENANT_REQUIRED',
        message: 'Tenant context required for limit check.'
      });
    }

    const organization = req.tenant.organization;
    const currentUsage = organization.current_usage[limitType] || 0;
    const limit = organization.limits[limitType] || 0;

    if (currentUsage + count > limit) {
      return res.status(403).json({
        success: false,
        error: 'LIMIT_EXCEEDED',
        message: `You have reached your ${limitType} limit. Please upgrade your plan to add more.`,
        limit: limit,
        currentUsage: currentUsage,
        requested: count,
        upgradeRequired: true
      });
    }

    next();
  };
}

module.exports = {
  tenantContext,
  optionalTenantContext,
  requireTenantContext,
  checkTenantLimit
};
