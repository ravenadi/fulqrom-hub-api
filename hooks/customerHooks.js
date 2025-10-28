/**
 * Customer Module Hooks
 * 
 * Registers all action callbacks for customer-related events
 */

const { add_action } = require('../utils/actionHooks');
const { createAuditLog, getUserInfo } = require('../utils/auditHook');

// Audit logging for all customer saves
add_action('customer.after_save', 'audit_log', async (data) => {
  const { doc, action, context } = data;
  
  if (!context) return;
  
  const req = context.req;
  const { userId, userName, tenantId } = getUserInfo(req);
  
  if (!userId || !tenantId) return;

  const resourceName = doc.organisation?.organisation_name || 
                       doc.company_profile?.trading_name || 
                       'New Customer';
  
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const agent = req.get('user-agent') || 'unknown';

  createAuditLog({
    action,
    module: 'customer',
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

// TODO: Add more hooks as needed
// add_action('customer.after_create', 'welcome_email', async (data) => {
//   const { doc } = data;
//   await sendWelcomeEmail(doc);
// });

// add_action('customer.after_save', 'cache_invalidation', async (data) => {
//   const { doc } = data;
//   await redis.del(`customer:${doc._id}`);
// });

module.exports = 'Customer hooks registered';

