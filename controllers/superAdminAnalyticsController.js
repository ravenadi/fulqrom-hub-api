const Customer = require('../models/Customer');
const User = require('../models/User');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');

/**
 * Get comprehensive system statistics
 * @route GET /api/admin/stats/all
 * @access Super Admin only
 */
const getAllStats = async (req, res) => {
  try {
    const { tenant_id } = req.query;
    let queryFilter = {};
    if (tenant_id) {
      queryFilter = { customer_id: tenant_id };
    }

    const [
      totalUsers, totalDocuments, totalSites, totalBuildings, totalFloors,
      totalBuildingTenants, totalAssets, totalVendors, totalCustomers, activeCustomers,
      totalContacts, totalNotes, storageStats
    ] = await Promise.all([
      User.countDocuments(queryFilter),
      Document.countDocuments(queryFilter),
      Site.countDocuments(queryFilter),
      Building.countDocuments(queryFilter),
      Floor.countDocuments(queryFilter),
      Tenant.countDocuments(queryFilter), // Assuming Tenant model maps to BuildingTenant in Laravel context
      Asset.countDocuments(queryFilter),
      Vendor.countDocuments(queryFilter),
      Customer.countDocuments(tenant_id ? { _id: tenant_id } : {}), // Total tenants (customers)
      Customer.countDocuments(tenant_id ? { _id: tenant_id, is_active: true } : { is_active: true }), // Active tenants (customers)
      // TODO: Implement Contact and Note models if they exist and are tenant-scoped
      Promise.resolve(0), // Placeholder for totalContacts
      Promise.resolve(0),  // Placeholder for totalNotes
      // Calculate comprehensive storage statistics (similar to documents storage stats API)
      Document.aggregate([
        ...(tenant_id ? [{ $match: { customer_id: tenant_id } }] : []),
        {
          $group: {
            _id: null,
            totalSizeBytes: { $sum: { $ifNull: ['$file.file_meta.file_size', 0] } },
            documentsWithFiles: { 
              $sum: { 
                $cond: [
                  { $and: [
                    { $ne: ['$file.file_meta.file_size', null] },
                    { $gt: ['$file.file_meta.file_size', 0] }
                  ]}, 
                  1, 
                  0
                ] 
              } 
            },
            totalRecords: { $sum: 1 }
          }
        }
      ]).then(result => {
        const stats = result.length > 0 ? result[0] : {
          totalSizeBytes: 0,
          documentsWithFiles: 0,
          totalRecords: 0
        };
        
        const totalSizeBytes = stats.totalSizeBytes || 0;
        const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
        const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;
        
        return {
          totalSizeBytes,
          totalSizeMB: parseFloat(totalSizeMB),
          totalSizeGB: parseFloat(totalSizeGB),
          displaySize,
          totalRecords: stats.totalRecords,
          documentsWithFiles: stats.documentsWithFiles,
          documentsWithoutFiles: stats.totalRecords - stats.documentsWithFiles
        };
      })
    ]);

    return res.status(200).json({
      data: {
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_floors: totalFloors,
        total_building_tenants: totalBuildingTenants,
        total_documents: totalDocuments,
        total_users: totalUsers,
        total_tenants: totalCustomers,
        active_tenants: activeCustomers,
        total_assets: totalAssets,
        total_contacts: totalContacts, // Added to match Laravel
        total_vendors: totalVendors,
        total_notes: totalNotes, // Added to match Laravel
        // Storage statistics (similar to documents storage stats API)
        storage: {
          totalSizeBytes: storageStats.totalSizeBytes,
          totalSizeMB: storageStats.totalSizeMB,
          totalSizeGB: storageStats.totalSizeGB,
          displaySize: storageStats.displaySize,
          totalRecords: storageStats.totalRecords,
          documentsWithFiles: storageStats.documentsWithFiles,
          documentsWithoutFiles: storageStats.documentsWithoutFiles
        },
        // Legacy field for backward compatibility
        total_space_used: storageStats.totalSizeBytes,
        system_health: 'good'
      }
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    return res.status(500).json({
      error: 'Unable to fetch stats: ' + error.message,
      data: {
        total_sites: 0,
        total_buildings: 0,
        total_floors: 0,
        total_building_tenants: 0,
        total_documents: 0,
        total_users: 0,
        total_tenants: 0,
        active_tenants: 0,
        total_assets: 0,
        total_contacts: 0,
        total_vendors: 0,
        total_notes: 0,
        storage: {
          totalSizeBytes: 0,
          totalSizeMB: 0,
          totalSizeGB: 0,
          displaySize: "0 MB",
          totalRecords: 0,
          documentsWithFiles: 0,
          documentsWithoutFiles: 0
        },
        total_space_used: 0,
        system_health: 'error'
      }
    });
  }
};

/**
 * Get tenant-specific analytics
 * @route GET /api/admin/stats/tenant/:tenant_id
 * @access Super Admin only
 */
const getTenantStats = async (req, res) => {
  try {
    const { tenant_id } = req.params;
    
    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const queryFilter = { customer_id: tenant_id };

    const [
      totalUsers, totalDocuments, totalSites, totalBuildings, totalFloors,
      totalAssets, totalVendors
    ] = await Promise.all([
      User.countDocuments(queryFilter),
      Document.countDocuments(queryFilter),
      Site.countDocuments(queryFilter),
      Building.countDocuments(queryFilter),
      Floor.countDocuments(queryFilter),
      Asset.countDocuments(queryFilter),
      Vendor.countDocuments(queryFilter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenant_id: tenant_id,
        total_users: totalUsers,
        total_documents: totalDocuments,
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_floors: totalFloors,
        total_assets: totalAssets,
        total_vendors: totalVendors,
        total_space_used: 0 // TODO: Calculate actual storage usage
      }
    });
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant stats: ' + error.message
    });
  }
};

/**
 * Get system health metrics
 * @route GET /api/admin/stats/health
 * @access Super Admin only
 */
const getSystemHealth = async (req, res) => {
  try {
    const [
      totalTenants, activeTenants, totalUsers, totalDocuments,
      recentErrors, systemUptime
    ] = await Promise.all([
      Customer.countDocuments({}),
      Customer.countDocuments({ is_active: true }),
      User.countDocuments({}),
      Document.countDocuments({}),
      AuditLog.countDocuments({ 
        action: 'error',
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }),
      Promise.resolve(99.9) // TODO: Calculate actual uptime
    ]);

    const healthScore = Math.min(100, Math.max(0, 
      100 - (recentErrors * 2) - ((totalTenants - activeTenants) / totalTenants * 10)
    ));

    res.status(200).json({
      success: true,
      data: {
        health_score: healthScore,
        status: healthScore > 90 ? 'excellent' : healthScore > 70 ? 'good' : healthScore > 50 ? 'fair' : 'poor',
        metrics: {
          total_tenants: totalTenants,
          active_tenants: activeTenants,
          total_users: totalUsers,
          total_documents: totalDocuments,
          recent_errors: recentErrors,
          system_uptime: systemUptime
        },
        last_updated: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system health: ' + error.message
    });
  }
};

/**
 * Get usage trends over time
 * @route GET /api/admin/stats/trends
 * @access Super Admin only
 */
const getUsageTrends = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let daysBack = 30;
    if (period === '7d') daysBack = 7;
    else if (period === '90d') daysBack = 90;
    else if (period === '1y') daysBack = 365;

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Get daily user registrations
    const userTrends = await User.aggregate([
      {
        $match: {
          created_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' },
            day: { $dayOfMonth: '$created_at' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Get daily document uploads
    const documentTrends = await Document.aggregate([
      {
        $match: {
          created_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' },
            day: { $dayOfMonth: '$created_at' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: period,
        user_trends: userTrends,
        document_trends: documentTrends,
        generated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching usage trends:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching usage trends: ' + error.message
    });
  }
};

module.exports = {
  getAllStats,
  getTenantStats,
  getSystemHealth,
  getUsageTrends
};