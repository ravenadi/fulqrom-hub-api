const express = require('express');
const mongoose = require('mongoose');
const Floor = require('../models/Floor');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');

const router = express.Router();

// GET /api/floors - List all floors with pagination and search
router.get('/', checkModulePermission('floors', 'view'), async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 10,
      search,
      customer_id,
      site_id,
      building_id,
      floor_type,
      sort_by = 'floor_number',
      sort_order = 'asc'
    } = req.query;

    // Build filter query
    let filterQuery = {};

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { floor_name: new RegExp(search, 'i') }
      ];
    }

    // Filter by customer
    if (customer_id) {
      const customerIds = customer_id.split(',').map(id => id.trim());
      filterQuery.customer_id = { $in: customerIds };
    }

    // Filter by site
    if (site_id) {
      const siteIds = site_id.split(',').map(id => id.trim());
      filterQuery.site_id = { $in: siteIds };
    }

    // Filter by building
    if (building_id) {
      const buildingIds = building_id.split(',').map(id => id.trim());
      filterQuery.building_id = { $in: buildingIds };
    }

    // Filter by floor type (multi-select support)
    if (floor_type) {
      const types = floor_type.includes(',')
        ? floor_type.split(',').map(t => t.trim())
        : floor_type;
      filterQuery.floor_type = Array.isArray(types) ? { $in: types } : types;
    }

    // Pagination
    const limit = parseInt(per_page);
    const skip = (parseInt(page) - 1) * limit;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sort_by] = sort_order === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalCount = await Floor.countDocuments(filterQuery);

    // Fetch floors with pagination
    const floors = await Floor.find(filterQuery)
      .populate({
        path: 'site_id',
        select: 'site_name address',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'building_id',
        select: 'building_name building_code',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'customer_id',
        select: 'organisation.organisation_name',
        options: { strictPopulate: false }
      })
      .sort(sortConfig)
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = parseInt(page);

    res.status(200).json({
      success: true,
      data: floors,
      meta: {
        current_page: currentPage,
        per_page: limit,
        total: totalCount,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + limit, totalCount)
      },
      links: {
        first: `${req.protocol}://${req.get('host')}${req.baseUrl}?page=1&per_page=${limit}`,
        last: `${req.protocol}://${req.get('host')}${req.baseUrl}?page=${totalPages}&per_page=${limit}`,
        prev: currentPage > 1 ? `${req.protocol}://${req.get('host')}${req.baseUrl}?page=${currentPage - 1}&per_page=${limit}` : null,
        next: currentPage < totalPages ? `${req.protocol}://${req.get('host')}${req.baseUrl}?page=${currentPage + 1}&per_page=${limit}` : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floors',
      error: error.message
    });
  }
});

// GET /api/floors/:id - Get single floor
router.get('/:id', checkResourcePermission('floor', 'view', (req) => req.params.id), async (req, res) => {
  try {
    const floor = await Floor.findById(req.params.id)
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address status')
      .populate('building_id', 'building_name building_code category building_grade');

    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: floor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floor',
      error: error.message
    });
  }
});

// POST /api/floors - Create new floor
router.post('/', checkModulePermission('floors', 'create'), async (req, res) => {
  try {
    // Validation for new fields
    const errors = [];
    const floorData = { ...req.body };

    // Handle backward compatibility: occupancy -> maximum_occupancy
    if (floorData.occupancy !== undefined && floorData.maximum_occupancy === undefined) {
      floorData.maximum_occupancy = floorData.occupancy;
      delete floorData.occupancy;
    }

    // Ceiling Height - Validate if provided
    if (floorData.ceiling_height !== undefined && floorData.ceiling_height < 0) {
      errors.push('Ceiling height must be a positive number');
    }

    // Occupancy Type - Validate enum if provided
    if (floorData.occupancy_type && !['Single Tenant', 'Multi Tenant', 'Common Area'].includes(floorData.occupancy_type)) {
      errors.push('Invalid occupancy type');
    }

    // Access Control - Validate enum if provided
    if (floorData.access_control && !['Public', 'Keycard Required', 'Restricted'].includes(floorData.access_control)) {
      errors.push('Invalid access control level');
    }

    // HVAC Zones - Validate if provided
    if (floorData.hvac_zones !== undefined && (floorData.hvac_zones < 0 || !Number.isInteger(floorData.hvac_zones))) {
      errors.push('HVAC zones must be a non-negative integer');
    }

    // Special Features - Validate array if provided
    if (floorData.special_features) {
      if (!Array.isArray(floorData.special_features)) {
        errors.push('Special features must be an array');
      } else {
        const validFeatures = ['Equipment Room', 'Common Area', 'Server Room', 'Meeting Room', 'Kitchen', 'Storage'];
        const invalidFeatures = floorData.special_features.filter(f => !validFeatures.includes(f));
        if (invalidFeatures.length > 0) {
          errors.push(`Invalid special features: ${invalidFeatures.join(', ')}`);
        }
      }
    }

    // Maximum Occupancy - Validate if provided
    if (floorData.maximum_occupancy !== undefined && (floorData.maximum_occupancy < 0 || !Number.isInteger(floorData.maximum_occupancy))) {
      errors.push('Maximum occupancy must be a non-negative integer');
    }

    // If validation errors exist, return them
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to create floor'
      });
    }

    // Add tenant_id to floor data
    floorData.tenant_id = tenantId;

    const floor = new Floor(floorData);
    await floor.save();

    // Populate the created floor before returning
    await floor.populate('customer_id', 'organisation.organisation_name');
    await floor.populate('site_id', 'site_name address');
    await floor.populate('building_id', 'building_name building_code');

    res.status(201).json({
      success: true,
      message: 'Floor created successfully',
      data: floor
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating floor',
      error: error.message
    });
  }
});

// PUT /api/floors/:id - Update floor
router.put('/:id', checkResourcePermission('floor', 'edit', (req) => req.params.id), async (req, res) => {
  try {
    // Validation for new fields
    const errors = [];
    const floorData = { ...req.body };

    // Handle backward compatibility: occupancy -> maximum_occupancy
    if (floorData.occupancy !== undefined && floorData.maximum_occupancy === undefined) {
      floorData.maximum_occupancy = floorData.occupancy;
      delete floorData.occupancy;
    }

    // Ceiling Height - Validate if provided
    if (floorData.ceiling_height !== undefined && floorData.ceiling_height < 0) {
      errors.push('Ceiling height must be a positive number');
    }

    // Occupancy Type - Validate enum if provided
    if (floorData.occupancy_type && !['Single Tenant', 'Multi Tenant', 'Common Area'].includes(floorData.occupancy_type)) {
      errors.push('Invalid occupancy type');
    }

    // Access Control - Validate enum if provided
    if (floorData.access_control && !['Public', 'Keycard Required', 'Restricted'].includes(floorData.access_control)) {
      errors.push('Invalid access control level');
    }

    // HVAC Zones - Validate if provided
    if (floorData.hvac_zones !== undefined && (floorData.hvac_zones < 0 || !Number.isInteger(floorData.hvac_zones))) {
      errors.push('HVAC zones must be a non-negative integer');
    }

    // Special Features - Validate array if provided
    if (floorData.special_features) {
      if (!Array.isArray(floorData.special_features)) {
        errors.push('Special features must be an array');
      } else {
        const validFeatures = ['Equipment Room', 'Common Area', 'Server Room', 'Meeting Room', 'Kitchen', 'Storage'];
        const invalidFeatures = floorData.special_features.filter(f => !validFeatures.includes(f));
        if (invalidFeatures.length > 0) {
          errors.push(`Invalid special features: ${invalidFeatures.join(', ')}`);
        }
      }
    }

    // Maximum Occupancy - Validate if provided
    if (floorData.maximum_occupancy !== undefined && (floorData.maximum_occupancy < 0 || !Number.isInteger(floorData.maximum_occupancy))) {
      errors.push('Maximum occupancy must be a non-negative integer');
    }

    // If validation errors exist, return them
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update floor'
      });
    }

    // Update ONLY if belongs to user's tenant
    const floor = await Floor.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: tenantId  // Ensure user owns this resource
      },
      floorData,
      { new: true, runValidators: true }
    )
    .populate('site_id', 'site_name address')
    .populate('building_id', 'building_name building_code')
    .populate('customer_id', 'organisation.organisation_name');

    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found or you do not have permission to update it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Floor updated successfully',
      data: floor
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating floor',
      error: error.message
    });
  }
});

// DELETE /api/floors/:id - Delete floor
router.delete('/:id', checkResourcePermission('floor', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete floor'
      });
    }

    // Delete ONLY if belongs to user's tenant
    const floor = await Floor.findOneAndDelete({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this resource
    });

    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Floor deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting floor',
      error: error.message
    });
  }
});

// GET /api/floors/by-building/:buildingId - Get floors by building
router.get('/by-building/:buildingId', async (req, res) => {
  try {
    const floors = await Floor.find({ building_id: req.params.buildingId })
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .sort({ floor_number: 1 });

    const summary = {
      total_floors: floors.length,
      active_floors: floors.filter(f => f.status === 'Active').length,
      total_area: floors.reduce((sum, f) => sum + (f.floor_area || 0), 0),
      total_assets: floors.reduce((sum, f) => sum + (f.assets_count || 0), 0),
      avg_occupancy: floors.length > 0 ?
        Math.round(floors.reduce((sum, f) => sum + (f.maximum_occupancy || f.occupancy || 0), 0) / floors.length) : 0
    };

    res.status(200).json({
      success: true,
      count: floors.length,
      summary,
      data: floors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floors by building',
      error: error.message
    });
  }
});

// GET /api/floors/summary/stats - Get floor summary statistics
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = new mongoose.Types.ObjectId(building_id);

    const stats = await Floor.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalFloors: { $sum: 1 },
          activeFloors: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          underConstruction: {
            $sum: { $cond: [{ $eq: ['$status', 'Under Construction'] }, 1, 0] }
          },
          totalArea: { $sum: '$floor_area' },
          totalAssets: { $sum: '$assets_count' },
          avgOccupancy: { $avg: '$maximum_occupancy' },
          avgCeilingHeight: { $avg: '$ceiling_height' }
        }
      }
    ]);

    const result = stats[0] || {
      totalFloors: 0,
      activeFloors: 0,
      underConstruction: 0,
      totalArea: 0,
      totalAssets: 0,
      avgOccupancy: 0,
      avgCeilingHeight: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floor statistics',
      error: error.message
    });
  }
});

// GET /api/floors/by-type - Group floors by type
router.get('/by-type', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = new mongoose.Types.ObjectId(building_id);

    const typeStats = await Floor.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$floor_type',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          totalArea: { $sum: '$floor_area' },
          avgOccupancy: { $avg: '$maximum_occupancy' },
          totalAssets: { $sum: '$assets_count' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: typeStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floor type statistics',
      error: error.message
    });
  }
});

module.exports = router;