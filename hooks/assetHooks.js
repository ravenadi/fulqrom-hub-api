/**
 * Asset Module Hooks
 */

const { add_action } = require('../utils/actionHooks');
const { createAuditLog, getUserInfo } = require('../utils/auditHook');

add_action('asset.after_save', 'audit_log', async (data) => {
  const { doc, action, context } = data;
  
  if (!context) return;
  
  const req = context.req;
  const { userId, userName, tenantId } = getUserInfo(req);
  
  if (!userId || !tenantId) return;

  const resourceName = doc.asset_name || 'New Asset';
  
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const agent = req.get('user-agent') || 'unknown';

  createAuditLog({
    action,
    module: 'asset',
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

module.exports = 'Asset hooks registered';

