/**
 * Document Module Hooks
 */

const { add_action } = require('../utils/actionHooks');
const { createAuditLog, getUserInfo } = require('../utils/auditHook');

// Audit logging for document saves
add_action('document.after_save', 'audit_log', async (data) => {
  const { doc, action, context } = data;

  console.log('📝 Document hook triggered:', { action, hasContext: !!context, docId: doc._id });

  if (!context) {
    console.warn('⚠️ Document audit hook: No context found');
    return;
  }

  const req = context.req;
  const { userId, userName, tenantId } = getUserInfo(req);

  console.log('📝 Document audit hook user info:', { userId, userName, tenantId });

  if (!userId || !tenantId) {
    console.warn('⚠️ Document audit hook: Missing userId or tenantId', { userId, tenantId });
    return;
  }

  const resourceName = doc.name || doc.file?.file_meta?.file_name || doc.original_filename || 'New Document';

  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const agent = req.get('user-agent') || 'unknown';

  console.log('✅ Creating document audit log:', { action, module: 'document', resourceName, moduleId: doc._id });

  createAuditLog({
    action,
    module: 'document',
    resourceName,
    moduleId: doc._id,
    userId,
    userName,
    tenantId,
    ip,
    agent,
    detail: doc.toObject()
  });
});

// Status change detection for documents
add_action('document.status_changed', 'audit_log', async (data) => {
  const { doc, previousStatus, newStatus, context } = data;
  
  if (!context) return;
  
  const req = context.req;
  const { userId, userName, tenantId } = getUserInfo(req);
  
  if (!userId || !tenantId) return;

  const resourceName = doc.name || doc.file?.file_meta?.file_name || doc.original_filename || 'Document';
  
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const agent = req.get('user-agent') || 'unknown';

  createAuditLog({
    action: 'update',
    module: 'document',
    resourceName: `${resourceName} status changed from ${previousStatus} to ${newStatus}`,
    moduleId: doc._id,
    userId,
    userName,
    tenantId,
    ip,
    agent,
    detail: doc.toObject()
  });
});

module.exports = 'Document hooks registered';

