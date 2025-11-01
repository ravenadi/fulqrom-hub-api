/**
 * Mongoose Tenant Scope Middleware
 *
 * @deprecated This file is obsolete and no longer used.
 * Tenant isolation is now handled by the tenantPlugin.js plugin using AsyncLocalStorage.
 *
 * This file is kept for historical reference only.
 * DO NOT USE THIS MIDDLEWARE - it contains the removed bypass mechanism.
 *
 * See: plugins/tenantPlugin.js for current implementation
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
