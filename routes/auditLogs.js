const express = require('express');
const AuditLog = require('../models/AuditLog');
const { checkModulePermission } = require('../middleware/checkPermission');

const router = express.Router();

// Helper function to log audit entry
async function logAudit(logData, req) {
  try {
    const auditLog = new AuditLog({
      ...logData,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    });
    await auditLog.save();
  } catch (error) {
    console.error('Error logging audit entry:', error);
  }
}

// GET /api/audit-logs - Get audit logs with tenant filtering
// SECURITY: This endpoint automatically filters by the current user's tenant
// No tenant_id parameter is accepted to prevent cross-tenant data access
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      resource_type,
      status,
      user_id,
      start_date,
      end_date
    } = req.query;

    // Build filter query
    let filterQuery = {};

    // Tenant filtering - CRITICAL: Use tenant from request context, NOT query params
    const tenantId = req.tenant?.tenantId;

    console.log('🔍 Audit Logs - Tenant Context:', {
      tenantId: tenantId,
      userId: req.user?.userId || req.user?.id,
      userEmail: req.tenant?.userEmail,
      isSuperAdmin: req.tenant?.isSuperAdmin,
      headerTenantId: req.headers['x-tenant-id']
    });

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required',
        debug: {
          hasTenant: !!req.tenant,
          hasUser: !!req.user,
          tenantKeys: req.tenant ? Object.keys(req.tenant) : []
        }
      });
    }

    // Always filter by current user's tenant - ignore any tenant_id in query params
    filterQuery.tenant_id = tenantId;

    // Action filter
    if (action) {
      filterQuery.action = action;
    }

    // Resource type filter
    if (resource_type) {
      filterQuery.resource_type = resource_type;
    }

    // Status filter
    if (status) {
      filterQuery.status = status;
    }

    // User filter
    if (user_id) {
      filterQuery.user_id = user_id;
    }

    // Date range filter
    if (start_date || end_date) {
      filterQuery.created_at = {};
      if (start_date) {
        filterQuery.created_at.$gte = new Date(start_date);
      }
      if (end_date) {
        filterQuery.created_at.$lte = new Date(end_date);
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch audit logs
    const [auditLogs, totalLogs] = await Promise.all([
      AuditLog.find(filterQuery)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(filterQuery)
    ]);

    res.status(200).json({
      success: true,
      count: auditLogs.length,
      total: totalLogs,
      page: pageNum,
      pages: Math.ceil(totalLogs / limitNum),
      data: auditLogs
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit logs',
      error: error.message
    });
  }
});

// POST /api/audit-logs - Log audit entry
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      user_email,
      user_name,
      action,
      resource_type,
      resource_id,
      resource_name,
      details,
      status
    } = req.body;

    // Validate required fields
    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'action is required'
      });
    }

    if (!resource_type) {
      return res.status(400).json({
        success: false,
        message: 'resource_type is required'
      });
    }

    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to create audit log'
      });
    }

    // Create audit log with tenant_id from authenticated user
    const auditLog = new AuditLog({
      user_id,
      user_email,
      user_name,
      action,
      resource_type,
      resource_id,
      resource_name,
      details,
      status: status || 'success',
      tenant_id: tenantId,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    });

    await auditLog.save();

    res.status(201).json({
      success: true,
      message: 'Audit log created successfully',
      data: auditLog
    });

  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating audit log',
      error: error.message
    });
  }
});

module.exports = router;