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
// SUPER ADMIN: Can view any tenant's logs using X-Tenant-Id header
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

    // Get tenant context (automatically handles super admin X-Tenant-Id header)
    const tenantId = req.tenant?.tenantId;
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const isViewingOtherTenant = isSuperAdmin && req.tenant?.isImpersonating;
    const requestedTenantId = req.headers['x-tenant-id'];

    console.log('🔍 Audit Logs - Request:', {
      tenantId: tenantId,
      userId: req.user?.userId || req.user?.id,
      userEmail: req.tenant?.userEmail,
      isSuperAdmin: isSuperAdmin,
      requestedTenantId: requestedTenantId,
      isImpersonating: req.tenant?.isImpersonating
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

    // Filter by tenant (works for both normal users and super admins)
    // If super admin uses X-Tenant-Id header, tenantId is already set to target tenant
    filterQuery.tenant_id = tenantId;

    // Log super admin cross-tenant access
    if (isViewingOtherTenant) {
      console.log(`🔐 Super admin viewing audit logs for tenant: ${tenantId}`);
    }

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
    const limitNum = Math.min(parseInt(limit), 200); // Cap at 200
    const skip = (pageNum - 1) * limitNum;

    // Fetch audit logs with user population
    const [auditLogs, totalLogs] = await Promise.all([
      AuditLog.find(filterQuery)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user_id', 'full_name email')
        .lean(),
      AuditLog.countDocuments(filterQuery)
    ]);

    // Get tenant information for response metadata
    const Tenant = require('../models/Tenant');
    const mongoose = require('mongoose');
    const tenantInfo = await Tenant.findById(new mongoose.Types.ObjectId(tenantId))
      .select('tenant_name status')
      .lean();

    res.status(200).json({
      success: true,
      count: auditLogs.length,
      total: totalLogs,
      page: pageNum,
      pages: Math.ceil(totalLogs / limitNum),
      data: auditLogs,
      // Metadata for super admin
      tenant: {
        id: tenantId,
        name: tenantInfo?.tenant_name || 'Unknown',
        status: tenantInfo?.status || 'unknown'
      },
      meta: {
        is_super_admin: isSuperAdmin,
        is_viewing_other_tenant: isViewingOtherTenant,
        requested_tenant_id: requestedTenantId || null,
        filters_applied: {
          action: action || null,
          resource_type: resource_type || null,
          status: status || null,
          user_id: user_id || null,
          date_range: (start_date || end_date) ? {
            start: start_date || null,
            end: end_date || null
          } : null
        }
      }
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

// GET /api/audit-logs/stats - Get audit log statistics
router.get('/stats', async (req, res) => {
  try {
    // Get tenant context (automatically handles super admin X-Tenant-Id header)
    const tenantId = req.tenant?.tenantId;
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const isViewingOtherTenant = isSuperAdmin && req.tenant?.isImpersonating;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    console.log(`📊 Fetching audit log stats for tenant: ${tenantId}`);

    const mongoose = require('mongoose');
    const stats = await AuditLog.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      {
        $facet: {
          // Activity by action type
          by_action: [
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          // Activity by resource type
          by_resource: [
            { $group: { _id: '$resource_type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          // Activity by status
          by_status: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          // Activity by date (last 30 days)
          by_date: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ],
          // Total count
          total: [
            { $count: 'count' }
          ],
          // Recent activity (last 10)
          recent: [
            { $sort: { created_at: -1 } },
            { $limit: 10 },
            {
              $project: {
                action: 1,
                resource_type: 1,
                user_email: 1,
                created_at: 1
              }
            }
          ]
        }
      }
    ]);

    const Tenant = require('../models/Tenant');
    const tenantInfo = await Tenant.findById(new mongoose.Types.ObjectId(tenantId))
      .select('tenant_name status')
      .lean();

    res.json({
      success: true,
      data: stats[0],
      tenant: {
        id: tenantId,
        name: tenantInfo?.tenant_name || 'Unknown',
        status: tenantInfo?.status || 'unknown'
      },
      meta: {
        is_super_admin: isSuperAdmin,
        is_viewing_other_tenant: isViewingOtherTenant
      }
    });

  } catch (error) {
    console.error('Error fetching audit log stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit log statistics',
      error: error.message
    });
  }
});

// GET /api/audit-logs/tenants - Get available tenants (Super Admin only)
router.get('/tenants', async (req, res) => {
  try {
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;

    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only accessible to super admins'
      });
    }

    const Tenant = require('../models/Tenant');
    const tenants = await Tenant.find({ is_active: true })
      .select('_id tenant_name display_name status')
      .sort({ tenant_name: 1 })
      .lean();

    const formattedTenants = tenants.map(tenant => ({
      id: tenant._id,
      label: tenant.display_name || tenant.tenant_name,
      value: tenant._id.toString(),
      status: tenant.status
    }));

    res.json({
      success: true,
      count: formattedTenants.length,
      data: formattedTenants
    });

  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants',
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