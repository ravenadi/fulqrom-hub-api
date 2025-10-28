const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const { do_action } = require('./actionHooks');

/**
 * Audit Hook Utility - Scalable audit logging using WordPress-style action hooks
 * 
 * Uses the do_action() system to trigger registered callbacks
 * without blocking the main application flow
 */

/**
 * Get user info from req object
 */
function getUserInfo(req) {
  const userId = req?.user?.userId || req?.user?.id || req?.user?._id;
  const userName = req?.user?.full_name || req?.user?.name || 'Unknown User';
  const tenantId = req?.tenant?.tenantId || req?.user?.tenant_id;
  
  return { userId, userName, tenantId };
}

/**
 * Create audit log entry (non-blocking)
 */
function createAuditLog({ action, module, resourceName, moduleId, userId, userName, tenantId, ip, agent, detail }) {
  // Fire and forget - don't block the main flow
  setImmediate(async () => {
    try {
      if (!userId || !tenantId) {
        console.warn('⚠️ Audit log skipped: Missing user or tenant information');
        return;
      }

      // Convert IDs to ObjectId if needed
      const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
      const tenantObjectId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
      let moduleIdObjectId = null;
      if (moduleId) {
        moduleIdObjectId = typeof moduleId === 'string' ? new mongoose.Types.ObjectId(moduleId) : moduleId;
      }

      // Format description based on action
      let description = '';
      if (action === 'create') {
        description = `${resourceName} created`;
      } else if (action === 'update') {
        description = `${resourceName} updated`;
      } else if (action === 'delete') {
        description = `${resourceName} deleted`;
      } else if (action === 'read') {
        description = `${resourceName} viewed`;
      } else if (action === 'auth') {
        description = `${resourceName} authenticated`;
      } else {
        description = `${resourceName} ${action}d`;
      }

      const auditLog = new AuditLog({
        action,
        description,
        module,
        module_id: moduleIdObjectId,
        user: {
          id: userObjectId,
          name: userName
        },
        ip: ip || 'unknown',
        agent: agent || 'unknown',
        detail: detail || undefined,
        tenant_id: tenantObjectId,
        created_at: new Date()
      });

      await auditLog.save();

      if (process.env.NODE_ENV === 'development') {
        console.log('✓ Audit log created:', { action, module, resourceName, user: userName });
      }

    } catch (error) {
      console.error('❌ Error creating audit log:', error);
    }
  });
}

/**
 * Setup audit hooks for a model
 * Uses WordPress-style do_action() to trigger registered callbacks
 * 
 * @param {mongoose.Model} Model - The Mongoose model
 * @param {Object} config - Configuration
 * @param {string} config.module - Module name (customer, site, building, etc.)
 * @param {Function} config.getResourceName - Function to get resource name from doc
 */
function setupAuditHooks(Model, config) {
  const { module } = config;

  // Pre-save hook to track if document is new
  Model.schema.pre('save', function(next) {
    // Mark as new before save for post-save hook to use
    this.wasNew = this.isNew;
    next();
  });

  // Post-save hook that triggers action
  Model.schema.post('save', async function(doc) {
    try {
      const context = doc.$__?.auditContext;
      if (!context) return;

      // Use context action if available, otherwise determine from wasNew flag
      const actionType = context.action || (doc.wasNew ? 'create' : 'update');
      const data = {
        doc: doc,
        action: actionType,
        context
      };

      // Trigger actions using do_action() - all registered callbacks will run
      await do_action(`${module}.after_save`, data);
      
      // Also trigger specific actions
      if (actionType === 'create') {
        await do_action(`${module}.after_create`, data);
      } else {
        await do_action(`${module}.after_update`, data);
      }

    } catch (error) {
      console.error(`Error in ${module} save hook:`, error);
    }
  });

  // Post-remove hook for delete
  Model.schema.post('remove', async function(doc) {
    try {
      const context = doc.$__?.auditContext;
      if (!context) return;

      const data = {
        doc: doc,
        action: 'delete',
        context
      };

      await do_action(`${module}.after_delete`, data);

    } catch (error) {
      console.error(`Error in ${module} remove hook:`, error);
    }
  });

  console.log(`✓ Action hooks configured for ${module} module`);
}

/**
 * Helper to set audit context before operations
 * Usage: doc.$setAuditContext(req, 'update')
 */
function addAuditContextHelper(Model) {
  Model.prototype.$setAuditContext = function(req, action = 'create') {
    this.$__ = this.$__ || {};
    this.$__.auditContext = { req, action };
  };
}

module.exports = {
  setupAuditHooks,
  addAuditContextHelper,
  createAuditLog,
  getUserInfo
};

