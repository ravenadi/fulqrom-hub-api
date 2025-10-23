/**
 * Mongoose Tenant Scope Middleware
 *
 * This middleware automatically injects tenant_id into all Mongoose queries
 * based on the authenticated user's tenant context.
 *
 * IMPORTANT: This middleware MUST be placed AFTER tenantContext middleware.
 */

const mongoose = require('mongoose');

/**
 * Middleware to automatically scope all Mongoose queries to the current tenant
 *
 * This intercepts all Mongoose queries and adds the tenant_id filter automatically,
 * ensuring complete data isolation between tenants.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function mongooseTenantScope(req, res, next) {
  // Skip if no tenant context or if super admin bypassing
  if (!req.tenant || !req.tenant.tenantId || req.tenant.bypassTenant) {
    return next();
  }

  const tenantId = req.tenant.tenantId;

  // Store original Mongoose model functions
  if (!mongoose._originalFind) {
    // Save original methods (only once)
    const originalMethods = {};

    // Intercept Model.find()
    originalMethods.find = mongoose.Model.find;
    mongoose.Model.find = function(conditions, projection, options) {
      // Only apply if model has tenant_id field (i.e., has tenantPlugin)
      if (this.schema.paths.tenant_id) {
        // Add _tenantId to options
        options = options || {};
        if (!options._bypassTenantFilter && !options._tenantId) {
          options._tenantId = tenantId;
        }
      }
      return originalMethods.find.call(this, conditions, projection, options);
    };

    // Store for cleanup
    mongoose._originalFind = originalMethods.find;
  }

  next();
}

module.exports = mongooseTenantScope;
