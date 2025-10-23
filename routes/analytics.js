const express = require('express');
const mongoose = require('mongoose');
const { checkModulePermission } = require('../middleware/checkPermission');
const { applyScopeFiltering } = require('../middleware/authorizationRules');

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

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required. User must be associated with a tenant.'
      });
    }

    // Build filter query based on tenant context
    let filterQuery = {};
    let documentFilterQuery = {};
    let userFilterQuery = {};
    
    if (tenantId) {
      filterQuery.tenant_id = tenantId;
      documentFilterQuery = { tenant_id: tenantId };
      userFilterQuery = { tenant_id: tenantId };
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
      
      // Total Assets
      Asset.countDocuments(filterQuery),
      
      // Total Documents - use correct filter
      Document.countDocuments(documentFilterQuery),
      
      // Total Vendors
      Vendor.countDocuments(filterQuery),
      
      // Total Users - use correct filter
      User.countDocuments(userFilterQuery),
      
      // Storage calculation using aggregation for efficiency
      Document.aggregate([
        ...(tenantId ? [{ $match: { tenant_id: tenantId } }] : []),
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

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required. User must be associated with a tenant.'
      });
    }

    // Build filter query based on tenant context
    let filterQuery = {};
    if (tenantId) {
      filterQuery.tenant_id = tenantId;
    }

    // Fetch only coordinates and essential fields for map display
    const buildings = await Building.find(filterQuery)
      .select('_id building_name latitude longitude address site_id customer_id')
      .populate('site_id', 'site_name')
      .populate('customer_id', 'organisation_name')
      .lean();

    // Transform to lightweight format for map
    const coordinates = buildings
      .filter(building => building.latitude && building.longitude) // Only buildings with coordinates
      .map(building => ({
        id: building._id.toString(),
        building_name: building.building_name,
        latitude: building.latitude,
        longitude: building.longitude,
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
