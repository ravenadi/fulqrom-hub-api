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
const mongoose = require('mongoose');
const { setTenant } = require('../utils/requestContext');

/**
 * Helper function to fetch user with proper ID handling
 * Handles both MongoDB ObjectId and Auth0 ID strings
 */
const fetchUserById = async (userId) => {
  // User model has autoFilter: false, so no tenant filtering is applied
  if (mongoose.Types.ObjectId.isValid(userId)) {
    return await User.findById(userId);
  }

  // Otherwise, treat it as an auth0_id
  return await User.findOne({ auth0_id: userId });
};

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
    // (e.g., health checks, public endpoints, admin routes)
    if (req.path === '/health' || req.path === '/') {
      return next();
    }

    // Skip for super admin routes - they handle their own tenant context via query params
    // req.path at this middleware level starts with /admin (since /api is stripped by router)
    // IMPORTANT: Only skip routes that START with /admin/ (with trailing slash) or are exactly /admin
    if (req.path === '/admin' || req.path.startsWith('/admin/')) {
      return next();
    }

    // Check if user is authenticated
    if (!req.user || (!req.user.userId && !req.user.id)) {
      // If no authenticated user, skip tenant resolution
      // (authentication middleware will handle auth errors)
      return next();
    }

    const userId = req.user.userId || req.user.id;

    // Check if this is a super admin user
    // Super admins can bypass tenant context or switch tenants via query param
    const isSuperAdmin = req.user.is_super_admin || req.user.isSuperAdmin || false;

    // Super admin handling
    if (isSuperAdmin) {
      const tenantIdParam = req.query?.tenant_id;
      const isAdminRoute = req.path.startsWith('/admin/');

      // Super admin accessing admin routes without tenant_id = cross-tenant access (all data)
      if (!tenantIdParam && isAdminRoute) {
        req.tenant = {
          tenantId: null,
          isSuperAdmin: true,
          allowCrossTenant: true
        };
        return next();
      }

      // Super admin with tenant_id query param = filter by that tenant
      if (tenantIdParam) {
        // Validate tenant exists
        const tenant = await Tenant.findById(tenantIdParam).populate('plan_id', 'plan_name description');
        if (!tenant) {
          return res.status(404).json({
            success: false,
            error: 'TENANT_NOT_FOUND',
            message: 'Specified tenant not found'
          });
        }

        // Set tenant context for this request
        req.tenant = {
          tenantId: tenantIdParam,
          tenant: tenant,
          isSuperAdmin: true,
          allowCrossTenant: false
        };
        return next();
      }

      // Super admin without tenant on non-admin routes = require tenant
      return res.status(400).json({
        success: false,
        error: 'TENANT_ID_REQUIRED',
        message: 'Super admin must provide tenant_id query parameter for this endpoint'
      });
    }

    // Get user from database to retrieve tenant_id for normal users
    const user = await fetchUserById(userId);

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

    // Resolve target tenant id for normal users
    let targetTenantId = user.tenant_id;

    // Get tenant
    const tenant = await Tenant.findById(targetTenantId).populate('plan_id', 'plan_name description');

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Tenant not found'
      });
    }

    // Validate tenant is active
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_INACTIVE',
        message: 'Your tenant account has been deactivated. Please contact support.',
        tenantStatus: tenant.status
      });
    }

    // Check if tenant is suspended
    if (tenant.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_SUSPENDED',
        message: 'Your tenant account has been suspended. Please contact support to resolve this issue.'
      });
    }

    // Try to get organization for this tenant (optional for backward compatibility)
    const organization = await Organization.findOne({ tenant_id: targetTenantId })
      .populate('plan_id', 'name description features')
      .lean()
      .catch(() => null); // Don't fail if organization doesn't exist

    // Set tenant in ALS context for strict tenant isolation
    setTenant(tenant._id);


    // Attach tenant context to request
    req.tenant = {
      // Core tenant identifiers
      tenantId: tenant._id,
      organizationId: organization?._id || tenant._id,
      tenantSlug: organization?.slug || tenant.tenant_name?.toLowerCase().replace(/\s+/g, '-'),
      tenantName: tenant.tenant_name || tenant.display_name,

      // Full objects
      tenant: tenant,
      organization: organization, // May be null

      // User information
      userId: user._id,
      userEmail: user.email,
      userRoleIds: user.role_ids || [],

      // Admin flags
      isSuperAdmin: isSuperAdmin,
      isImpersonating: isSuperAdmin && !!req.query?.tenant_id,
      isOwner: organization?.owner_id && user._id.toString() === organization.owner_id.toString(),

      // Tenant/Organization status and limits
      organizationStatus: organization?.status || tenant.status,
      tenantStatus: tenant.status,
      isTrialActive: tenant.plan_status?.is_trial || false,
      trialDaysRemaining: 0, // Calculate if needed
      limits: organization?.limits || { users: 999, buildings: 999, sites: 999, storage_gb: 100 },
      currentUsage: organization?.current_usage || { users: 0, buildings: 0, sites: 0, storage_bytes: 0 },

      // Helper methods (use organization if available, otherwise allow all)
      canAddUsers: (count = 1) => organization?.canAddUsers?.(count) ?? true,
      canAddBuildings: (count = 1) => organization?.canAddBuildings?.(count) ?? true,
      canAddSites: (count = 1) => organization?.canAddSites?.(count) ?? true,
      canAddStorage: (bytes) => organization?.canAddStorage?.(bytes) ?? true
    };

    // Also attach to res.locals for use in views/templates
    res.locals.tenant = req.tenant;

    console.log(`🎉 [TENANT-CONTEXT] SUCCESS - Set tenant context for user ${user._id} with tenant ${tenant._id}`);
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
    if (!req.user || (!req.user.userId && !req.user.id)) {
      req.tenant = null;
      return next();
    }

    const userId = req.user.userId || req.user.id;

    // Get user from database
    const user = await fetchUserById(userId);

    if (!user || !user.tenant_id) {
      req.tenant = null;
      return next();
    }

    // Get tenant
    const tenant = await Tenant.findById(user.tenant_id).populate('plan_id', 'plan_name description');

    if (!tenant) {
      req.tenant = null;
      return next();
    }

    // Try to get organization (optional)
    const organization = await Organization.findOne({ tenant_id: user.tenant_id })
      .populate('plan_id', 'name description features')
      .lean()
      .catch(() => null);

    // Attach tenant context (minimal validation)
    req.tenant = {
      tenantId: tenant._id,
      organizationId: organization?._id || tenant._id,
      tenantSlug: organization?.slug || tenant.tenant_name?.toLowerCase().replace(/\s+/g, '-'),
      tenantName: tenant.tenant_name || tenant.display_name,
      tenant: tenant,
      organization: organization,
      userId: user._id,
      userEmail: user.email,
      organizationStatus: organization?.status || tenant.status,
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
