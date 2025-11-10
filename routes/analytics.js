const express = require('express');
const mongoose = require('mongoose');
const { checkModulePermission } = require('../middleware/checkPermission');
const {
  applyScopeFiltering,
  fetchUserById,
  isUserAdmin,
  hasModuleLevelAccess,
  getAccessibleResourceIds
} = require('../middleware/authorizationRules');

// Import models
const Customer = require('../models/Customer');
const User = require('../models/User');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const BuildingTenant = require('../models/BuildingTenant');

const router = express.Router();

// GET /api/analytics/dashboard - Optimized dashboard analytics with scope filtering (Rule 5)
router.get('/dashboard', checkModulePermission('analytics', 'view'), applyScopeFiltering('analytics'), async (req, res) => {
  try {
    // Get tenant context from authenticated user only - never from query parameters for security
    const tenantId = req.tenant?.tenantId;
    const userId = req.user?.id || req.user?._id;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required. User must be associated with a tenant.'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required.'
      });
    }

    // Fetch user for resource access filtering
    const user = await fetchUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isAdmin = isUserAdmin(user);

    // Build filter query based on tenant context
    let filterQuery = {};
    let documentFilterQuery = {};
    let userFilterQuery = {};
    let assetFilterQuery = {};

    if (tenantId) {
      filterQuery.tenant_id = tenantId;
      documentFilterQuery = { tenant_id: tenantId };
      userFilterQuery = { tenant_id: tenantId };
      assetFilterQuery = { tenant_id: tenantId };
    }

    // Apply resource-level filtering for non-admin users
    if (!isAdmin) {
      // Get accessible resource IDs for assets
      const resourceIds = getAccessibleResourceIds(user, 'asset');
      const accessibleAssetIds = resourceIds.asset || [];

      // If user has specific asset access restrictions, apply them
      if (accessibleAssetIds.length > 0) {
        assetFilterQuery._id = { $in: accessibleAssetIds };
        console.log('✅ [DASHBOARD] Applying asset ID filter:', accessibleAssetIds.length, 'assets');
      } else if (!hasModuleLevelAccess(user, 'assets')) {
        // User has no module-level access AND no specific resource access - count as 0
        assetFilterQuery._id = { $in: [] }; // No assets accessible
        console.log('❌ [DASHBOARD] User has no access to assets');
      }

      // Apply document filtering based on document categories and engineering disciplines
      const hasDocumentCategories = user.document_categories && user.document_categories.length > 0;
      const hasEngineeringDisciplines = user.engineering_disciplines && user.engineering_disciplines.length > 0;
      const hasDocumentModuleAccess = hasModuleLevelAccess(user, 'documents');

      // If user has no document access at all (no module access AND no category/discipline permissions)
      if (!hasDocumentModuleAccess && !hasDocumentCategories && !hasEngineeringDisciplines) {
        documentFilterQuery._id = { $in: [] }; // No documents accessible
        console.log('❌ [DASHBOARD] User has no access to documents');
      } else {
        // User has some level of document access - apply filters if specified
        if (hasDocumentCategories && hasEngineeringDisciplines) {
          // User has BOTH category AND discipline restrictions - documents must match BOTH
          documentFilterQuery.$and = [
            { category: { $in: user.document_categories } },
            { engineering_discipline: { $in: user.engineering_disciplines } }
          ];
          console.log('✅ [DASHBOARD] Applying BOTH category AND discipline filters:', {
            categories: user.document_categories,
            disciplines: user.engineering_disciplines
          });
        } else if (hasDocumentCategories) {
          // User has ONLY category restrictions
          documentFilterQuery.category = { $in: user.document_categories };
          console.log('✅ [DASHBOARD] Applying document category filter:', user.document_categories);
        } else if (hasEngineeringDisciplines) {
          // User has ONLY discipline restrictions
          documentFilterQuery.engineering_discipline = { $in: user.engineering_disciplines };
          console.log('✅ [DASHBOARD] Applying engineering discipline filter:', user.engineering_disciplines);
        }
        // If user has module access but no category/discipline restrictions, show all documents (no additional filter)
      }
    }

    // Use Promise.all for parallel execution of all stats queries
    const [
      totalCustomers,
      totalSites,
      totalBuildings,
      totalFloors,
      totalAssets,
      totalDocuments,
      totalVendors,
      totalUsers,
      storageStats
    ] = await Promise.all([
      // Total Customers/Tenants - for tenant context, count only that tenant
      Customer.countDocuments(tenantId ? { tenant_id: tenantId } : {}),

      // Total Sites
      Site.countDocuments(filterQuery),

      // Total Buildings
      Building.countDocuments(filterQuery),

      // Total Floors
      Floor.countDocuments(filterQuery),

      // Total Assets - use filtered query for resource access
      Asset.countDocuments(assetFilterQuery),

      // Total Documents - use filtered query for document permissions
      Document.countDocuments(documentFilterQuery),

      // Total Vendors
      Vendor.countDocuments(filterQuery),

      // Total Users - use correct filter
      User.countDocuments(userFilterQuery),

      // Storage calculation using aggregation for efficiency - apply document filters
      Document.aggregate([
        { $match: documentFilterQuery },
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

    // Return optimized response
    res.status(200).json({
      success: true,
      data: {
        total_customers: totalCustomers,
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_floors: totalFloors,
        total_assets: totalAssets,
        total_documents: totalDocuments,
        total_vendors: totalVendors,
        total_users: totalUsers,
        storage_used_mb: storageStats.totalSizeMB,
        storage_used_gb: storageStats.totalSizeGB,
        storage_display: storageStats.displaySize,
        storage_details: {
          total_size_bytes: storageStats.totalSizeBytes,
          documents_with_files: storageStats.documentsWithFiles,
          documents_without_files: storageStats.documentsWithoutFiles,
          total_documents: storageStats.totalRecords
        }
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics dashboard',
      error: error.message
    });
  }
});

// GET /api/analytics/reports - Reports analytics with scope filtering (Rule 5)
router.get('/reports', checkModulePermission('analytics', 'view'), applyScopeFiltering('analytics'), async (req, res) => {
  try {
    // TODO: Implement real report generation
    res.status(501).json({
      success: false,
      message: 'Analytics reports not yet implemented'
    });

  } catch (error) {
    console.error('Analytics reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating analytics reports',
      error: error.message
    });
  }
});

// GET /api/analytics/kpis - KPI analytics with scope filtering (Rule 5)
router.get('/kpis', checkModulePermission('analytics', 'view'), applyScopeFiltering('analytics'), async (req, res) => {
  try {
    // TODO: Implement real KPI calculations
    res.status(501).json({
      success: false,
      message: 'Analytics KPIs not yet implemented'
    });

  } catch (error) {
    console.error('Analytics KPIs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics KPIs',
      error: error.message
    });
  }
});

// GET /api/analytics/buildings/coordinates - Lightweight endpoint for building coordinates only
router.get('/buildings/coordinates', checkModulePermission('analytics', 'view'), applyScopeFiltering('analytics'), async (req, res) => {
  try {
    // Get tenant context from authenticated user only
    const tenantId = req.tenant?.tenantId;
    const userId = req.user?.id || req.user?._id;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required. User must be associated with a tenant.'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required.'
      });
    }

    // Build filter query based on tenant context
    // IMPORTANT: Exclude soft-deleted buildings
    let filterQuery = {
      is_delete: { $ne: true }
    };
    if (tenantId) {
      filterQuery.tenant_id = tenantId;
    }

    // Apply resource-level filtering based on user's resource_access
    const user = await fetchUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is Admin (full access - no filtering needed)
    if (!isUserAdmin(user)) {
      // Get user's accessible building IDs from resource_access
      const resourceIds = getAccessibleResourceIds(user, 'building');
      const accessibleBuildingIds = resourceIds.building || [];

      console.log('🔍 Building Coordinates - User Access Check:', {
        userId: user._id,
        isAdmin: isUserAdmin(user),
        hasModuleAccess: hasModuleLevelAccess(user, 'buildings'),
        accessibleBuildingIds,
        buildingIdsCount: accessibleBuildingIds.length
      });

      // If user has specific building access restrictions, apply them
      if (accessibleBuildingIds.length > 0) {
        // Filter by accessible building IDs only
        filterQuery._id = { $in: accessibleBuildingIds };
        console.log('✅ Applying building ID filter:', accessibleBuildingIds);
      } else if (!hasModuleLevelAccess(user, 'buildings')) {
        // User has no module-level access AND no specific resource access
        console.log('❌ User has no access to buildings');
        return res.json({
          success: true,
          data: [],
          count: 0,
          message: 'No buildings accessible to this user'
        });
      } else {
        console.log('✅ User has module-level access, showing all buildings in tenant');
      }
      // If user has module-level access and no specific restrictions, show all buildings in tenant
    }

    // Fetch buildings with address data for map display (filtered by permissions)
    // NOTE: Removed latitude/longitude from select to force address-based geocoding on frontend
    const buildings = await Building.find(filterQuery)
      .select('_id building_name address site_id customer_id')
      .populate({
        path: 'site_id',
        select: 'site_name is_delete',
        match: { is_delete: { $ne: true } }
      })
      .populate({
        path: 'customer_id',
        select: 'organisation_name is_delete',
        match: { is_delete: { $ne: true } }
      })
      .lean();

    // Transform to lightweight format for map - returns ALL buildings with address data
    // Frontend will handle geocoding from address fields
    // IMPORTANT: Filter out buildings whose customer or site was deleted (will be null after populate match)
    const coordinates = buildings
      .filter(building => {
        // Exclude buildings with deleted customer or site (populated as null)
        return building.customer_id !== null && building.site_id !== null;
      })
      .map(building => ({
        id: building._id.toString(),
        building_name: building.building_name,
        // NOTE: latitude/longitude intentionally excluded to force address-based geocoding
        address: building.address,
        site_id: building.site_id ? {
          _id: building.site_id._id,
          id: building.site_id._id,
          site_name: building.site_id.site_name
        } : null,
        customer_id: building.customer_id ? {
          _id: building.customer_id._id,
          id: building.customer_id._id
        } : null
      }));

    res.json({
      success: true,
      data: coordinates,
      count: coordinates.length,
      message: `Retrieved ${coordinates.length} building coordinates`
    });

  } catch (error) {
    console.error('Error fetching building coordinates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching building coordinates',
      error: error.message
    });
  }
});

module.exports = router;
