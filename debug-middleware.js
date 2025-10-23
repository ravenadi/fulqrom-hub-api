const express = require('express');
const router = express.Router();

// Debug endpoint to test middleware flow
router.get('/debug-middleware', (req, res) => {
  console.log('🔍 Debug Middleware Endpoint Called');
  console.log('req.user:', req.user);
  console.log('req.tenant:', req.tenant);
  console.log('req.auth:', req.auth);
  console.log('req.headers:', req.headers);
  
  res.json({
    success: true,
    debug: {
      hasUserObject: !!req.user,
      hasTenantObject: !!req.tenant,
      hasAuthObject: !!req.auth,
      userDetails: req.user ? {
        id: req.user.id,
        userId: req.user.userId,
        email: req.user.email,
        tenant_id: req.user.tenant_id
      } : null,
      tenantDetails: req.tenant ? {
        tenantId: req.tenant.tenantId,
        tenantName: req.tenant.tenantName,
        organizationId: req.tenant.organizationId
      } : null,
      authDetails: req.auth ? {
        payload: req.auth.payload,
        sub: req.auth.payload?.sub
      } : null,
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'Missing',
        'x-tenant-id': req.headers['x-tenant-id'] || 'Missing'
      }
    }
  });
});

module.exports = router;
