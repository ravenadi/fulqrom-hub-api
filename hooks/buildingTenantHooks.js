/**
 * Building Tenant Module Hooks
 */

const { add_action } = require('../utils/actionHooks');
const { createAuditLog, getUserInfo } = require('../utils/auditHook');

add_action('building_tenant.after_save', 'audit_log', async (data) => {
  const { doc, action, context } = data;
  
  if (!context) return;
  
  const req = context.req;
  const { userId, userName, tenantId } = getUserInfo(req);
  
  if (!userId || !tenantId) return;

  const resourceName = doc.tenant_trading_name || 
                       doc.tenant_legal_name || 
                       doc.tenant_name || 
                       'New Building Tenant';
  
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const agent = req.get('user-agent') || 'unknown';

  createAuditLog({
    action,
    module: 'building_tenant',
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

module.exports = 'Building Tenant hooks registered';

