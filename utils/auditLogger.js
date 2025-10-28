const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

/**
 * Audit Logger Utility - Simplified
 * Centralized audit logging for all user activities
 * 
 * Schema: action, description, module, user
 * 
 * Usage:
 * const { logAudit } = require('../utils/auditLogger');
 * await logAudit('create', 'Customer ABC created', 'customer', req);
 */

/**
 * Create an audit log entry
 * @param {string} action - Action type (create, read, update, delete, auth)
 * @param {string} description - Human-readable description of what happened
 * @param {string} module - Module name (auth, customer, site, building, floor, asset, tenant, document, user, vendor)
 * @param {Object} req - Express request object with req.user
 * @param {string|ObjectId} moduleId - (Optional) ID of the resource being acted upon
 * @param {Object} detail - (Optional) Full resource object for debugging
 */
async function logAudit(action, description, module, req, moduleId = null, detail = null) {
  // Fire and forget - don't await, don't block the main flow
  setImmediate(async () => {
    try {
      // Get user information from req.user (set by attachUser middleware)
      const userId = req.user?.userId || req.user?.id || req.user?._id;
      const userName = req.user?.full_name || req.user?.name || 'Unknown User';

      // Validate user exists
      if (!userId) {
        console.warn('⚠️ Audit log skipped: No user information available');
        return;
      }

      // Convert userId to ObjectId if it's a string
      const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

      // Extract IP address and user agent
      const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Convert moduleId to ObjectId if provided and it's a string
      let moduleIdObjectId = null;
      if (moduleId) {
        moduleIdObjectId = typeof moduleId === 'string' ? new mongoose.Types.ObjectId(moduleId) : moduleId;
      }

      // Get tenant_id from req.tenant or req.user
      const tenantId = req.tenant?.tenantId || req.user?.tenant_id;
      
      // Validate tenant exists for audit logging
      if (!tenantId) {
        console.warn('⚠️ Audit log skipped: No tenant information available');
        return;
      }

      // Convert tenantId to ObjectId if it's a string
      const tenantObjectId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

      // Create audit log entry with simplified schema
      const auditLog = new AuditLog({
        action,
        description,
        module,
        module_id: moduleIdObjectId,
        user: {
          id: userObjectId,
          name: userName
        },
        ip: ipAddress,
        agent: userAgent,
        detail: detail || undefined,
        tenant_id: tenantObjectId,
        created_at: new Date()
      });

      // Save audit log (non-blocking - don't throw errors)
      await auditLog.save();
      
      // Only log in development to avoid console spam
      if (process.env.NODE_ENV === 'development') {
        console.log('✓ Audit log created:', { action, module, description, user: userName });
      }

    } catch (error) {
      // Log error but don't throw - audit logging should never break the main flow
      console.error('❌ Error creating audit log:', error);
    }
  });
}

/**
 * Create audit log for create operations
 * @param {Object} params - Audit log parameters
 * @param {string} params.module - Module name
 * @param {string} params.resourceName - Name of the resource being created
 * @param {Object} params.req - Express request object
 * @param {string|ObjectId} params.moduleId - ID of the created resource
 * @param {Object} params.resource - (Optional) Full resource object for debugging
 */
function logCreate({ module, resourceName, req, moduleId = null, resource = null }) {
  const description = `${resourceName} created`;
  logAudit('create', description, module, req, moduleId, resource);
}

/**
 * Create audit log for update operations
 * @param {Object} params - Audit log parameters
 * @param {string} params.module - Module name
 * @param {string} params.resourceName - Name of the resource being updated
 * @param {Object} params.req - Express request object
 * @param {string|ObjectId} params.moduleId - ID of the updated resource
 * @param {Object} params.resource - (Optional) Full resource object for debugging
 */
function logUpdate({ module, resourceName, req, moduleId = null, resource = null }) {
  const description = `${resourceName} updated`;
  logAudit('update', description, module, req, moduleId, resource);
}

/**
 * Create audit log for delete operations
 * @param {Object} params - Audit log parameters
 * @param {string} params.module - Module name
 * @param {string} params.resourceName - Name of the resource being deleted
 * @param {Object} params.req - Express request object
 * @param {string|ObjectId} params.moduleId - ID of the deleted resource
 * @param {Object} params.resource - (Optional) Full resource object for debugging
 */
function logDelete({ module, resourceName, req, moduleId = null, resource = null }) {
  const description = `${resourceName} deleted`;
  logAudit('delete', description, module, req, moduleId, resource);
}

/**
 * Create audit log for status changes
 * @param {Object} params - Audit log parameters
 * @param {string} params.module - Module name
 * @param {string} params.resourceName - Name of the resource
 * @param {string} params.previousStatus - Previous status
 * @param {string} params.newStatus - New status
 * @param {Object} params.req - Express request object
 * @param {string|ObjectId} params.moduleId - ID of the resource
 * @param {Object} params.resource - (Optional) Full resource object for debugging
 */
function logStatusChange({ module, resourceName, previousStatus, newStatus, req, moduleId = null, resource = null }) {
  const description = `${resourceName} status changed from ${previousStatus} to ${newStatus}`;
  logAudit('update', description, module, req, moduleId, resource);
}

// Track recent logins to prevent duplicates
const recentLogins = new Map(); // key: `${userId}:${tokenIat}` -> timestamp

/**
 * Create audit log for login
 * @param {Object} req - Express request object
 * @param {number} tokenIat - Token issued-at timestamp (for duplicate prevention)
 */
function logLogin(req, tokenIat = null) {
  const userName = req.user?.full_name || req.user?.name || 'Unknown User';
  const userId = req.user?.userId || req.user?.id || req.user?._id;
  
  if (!userId) {
    return; // Silently skip if no user ID
  }
  
  // Create unique key using userId + tokenIat to prevent duplicates for same token
  const userKey = userId.toString();
  const loginKey = tokenIat ? `${userKey}:${tokenIat}` : `${userKey}:${Date.now()}`;
  const now = Date.now();
  
  // Check if we already logged this exact token
  if (recentLogins.has(loginKey)) {
    return; // Already logged this token
  }
  
  // Also check if same user logged in very recently (within 5 minutes) with different token
  // This prevents logging multiple times even if multiple requests come in
  for (const [key, timestamp] of recentLogins.entries()) {
    if (key.startsWith(`${userKey}:`) && (now - timestamp) < 300000) {
      return; // User recently logged in
    }
  }
  
  // Log the login
  const description = `${userName} logged in`;
  logAudit('auth', description, 'auth', req);
  
  // Record this login
  recentLogins.set(loginKey, now);
  
  // Clean up old entries (older than 10 minutes)
  setTimeout(() => {
    recentLogins.delete(loginKey);
  }, 600000);
}

module.exports = {
  logAudit,
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
  logLogin
};

