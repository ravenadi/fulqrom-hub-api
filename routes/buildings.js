const express = require('express');
const mongoose = require('mongoose');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');
const { resolveHierarchy } = require('../utils/hierarchyLookup');

const router = express.Router();

// GET /api/buildings - List all buildings with pagination and search
router.get('/', checkModulePermission('buildings', 'view'), async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 10,
      search,
      customer_id,
      site_id,
      building_type,
      operational_status,
      status,
      tags,
      sort_by = 'createdAt',
      sort_order = 'desc',
      is_active
    } = req.query;

    // Get tenant ID from request context (mandatory)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Build filter query with mandatory tenant filter
    let filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }  // Exclude soft-deleted records
    };

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { building_name: new RegExp(search, 'i') },
        { building_code: new RegExp(search, 'i') },
        { site_name: new RegExp(search, 'i') },
        { 'address.street': new RegExp(search, 'i') },
        { 'address.suburb': new RegExp(search, 'i') },
        { 'address.state': new RegExp(search, 'i') },
        { 'address.postcode': new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') } // Search in tags array
      ];
    }

    // Filter by customer (multi-select support)
    if (customer_id) {
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;

      if (Array.isArray(customerIds)) {
        filterQuery.customer_id = {
          $in: customerIds.map(id =>
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          )
        };
      } else if (mongoose.Types.ObjectId.isValid(customerIds)) {
        filterQuery.customer_id = new mongoose.Types.ObjectId(customerIds);
      } else {
        filterQuery.customer_id = customerIds;
      }
    }

    // Filter by site (multi-select support)
    if (site_id) {
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;

      if (Array.isArray(siteIds)) {
        filterQuery.site_id = {
          $in: siteIds.map(id =>
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          )
        };
      } else if (mongoose.Types.ObjectId.isValid(siteIds)) {
        filterQuery.site_id = new mongoose.Types.ObjectId(siteIds);
      } else {
        filterQuery.site_id = siteIds;
      }
    }

    // Filter by building type (multi-select support)
    if (building_type) {
      const types = building_type.includes(',')
        ? building_type.split(',').map(t => t.trim())
        : building_type;
      filterQuery.building_type = Array.isArray(types) ? { $in: types } : types;
    }

    // Filter by tags (multi-select support)
    if (tags) {
      const tagsList = tags.includes(',')
        ? tags.split(',').map(t => t.trim())
        : [tags];
      // Match buildings that have ANY of the selected tags
      filterQuery.tags = { $in: tagsList };
    }

    // Filter by status (support both operational_status and status) (multi-select support)
    const statusFilter = operational_status || status;
    if (statusFilter) {
      const statuses = statusFilter.includes(',')
        ? statusFilter.split(',').map(s => s.trim())
        : statusFilter;
      filterQuery.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const limit = parseInt(per_page);
    const skip = (parseInt(page) - 1) * limit;

    // Sort configuration
    const sortField = ['createdAt', 'updatedAt', 'building_name', 'building_code', 'building_type', 'status', 'number_of_floors'].includes(sort_by) ? sort_by : 'createdAt';
    const sortDirection = sort_order === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalCount = await Building.countDocuments(filterQuery);

    // Use aggregation pipeline to include related counts
    const buildingsAggregation = await Building.aggregate([
      { $match: filterQuery },
      { $sort: { [sortField]: sortDirection } },
      { $skip: skip },
      { $limit: limit },
      // Lookup customer information
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: '_id',
          as: 'customer_data'
        }
      },
      {
        $unwind: {
          path: '$customer_data',
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup site information
      {
        $lookup: {
          from: 'sites',
          localField: 'site_id',
          foreignField: '_id',
          as: 'site_data'
        }
      },
      {
        $unwind: {
          path: '$site_data',
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup floors count
      {
        $lookup: {
          from: 'floors',
          let: { buildingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$building_id', '$$buildingId'] } } },
            { $count: 'count' }
          ],
          as: 'floors_data'
        }
      },
      // Lookup assets count
      {
        $lookup: {
          from: 'assets',
          let: { buildingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$building_id', '$$buildingId'] } } },
            { $count: 'count' }
          ],
          as: 'assets_data'
        }
      },
      // Lookup tenants count
      {
        $lookup: {
          from: 'building_tenants',
          let: { buildingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$building_id', '$$buildingId'] } } },
            { $count: 'count' }
          ],
          as: 'tenants_data'
        }
      },
      // Format the output
      {
        $addFields: {
          id: { $toString: '$_id' },
          customer_id: {
            $cond: {
              if: '$customer_data',
              then: {
                _id: { $toString: '$customer_data._id' },
                id: { $toString: '$customer_data._id' },
                organisation: '$customer_data.organisation',
                display_name: {
                  $ifNull: ['$customer_data.organisation.organisation_name', 'Unknown Organisation']
                }
              },
              else: null
            }
          },
          site_id: {
            $cond: {
              if: '$site_data',
              then: {
                _id: { $toString: '$site_data._id' },
                id: { $toString: '$site_data._id' },
                site_name: '$site_data.site_name',
                address: '$site_data.address'
              },
              else: null
            }
          },
          floors_count: {
            $ifNull: [{ $arrayElemAt: ['$floors_data.count', 0] }, 0]
          },
          assets_count: {
            $ifNull: [{ $arrayElemAt: ['$assets_data.count', 0] }, 0]
          },
          tenants_count: {
            $ifNull: [{ $arrayElemAt: ['$tenants_data.count', 0] }, 0]
          },
          // Apply defaults for new fields if missing
          building_type: { $ifNull: ['$building_type', 'Office'] },
          number_of_floors: { $ifNull: ['$number_of_floors', 0] },
          total_area: { $ifNull: ['$total_area', 0] },
          nabers_rating: { $ifNull: ['$nabers_rating', null] },
          primary_use: { $ifNull: ['$primary_use', 'Office'] },
          last_inspection_date: { $ifNull: ['$last_inspection_date', null] },
          accessibility_features: { $ifNull: ['$accessibility_features', []] },
          parking_spaces: { $ifNull: ['$parking_spaces', 0] },
          year_built: { $ifNull: ['$year_built', null] },
          manager: { $ifNull: ['$manager', {}] },
          onboarding_status: {
            $cond: {
              if: { $eq: ['$status', 'Active'] },
              then: 'Active',
              else: {
                $cond: {
                  if: { $eq: ['$status', 'Under Construction'] },
                  then: 'Development',
                  else: '$status'
                }
              }
            }
          },
          total_floor_area: '$total_area'
        }
      },
      // Remove temporary lookup fields
      {
        $project: {
          customer_data: 0,
          site_data: 0,
          floors_data: 0,
          assets_data: 0,
          tenants_data: 0
        }
      }
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = parseInt(page);

    res.status(200).json({
      success: true,
      data: buildingsAggregation,
      pagination: {
        page: currentPage,
        limit: limit,
        total: totalCount,
        total_pages: totalPages
      },
      meta: {
        current_page: currentPage,
        per_page: limit,
        total: totalCount,
        last_page: totalPages,
        from: skip + 1,
        to: Math.min(skip + limit, totalCount)
      }
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching buildings',
      error: error.message
    });
  }
});

// GET /api/buildings/:id - Get single building
router.get('/:id', checkResourcePermission('building', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to view building'
      });
    }

    // Find building ONLY if it belongs to the user's tenant
    const building = await Building.findOne({
      _id: req.params.id,
      tenant_id: tenantId,  // Ensure user owns this building
      is_delete: { $ne: true }  // Exclude soft-deleted records
    })
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address status');

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    // Add raw IDs to the response for convenience
    const responseData = building.toObject();
    responseData.site_id_raw = building.site_id;
    responseData.customer_id_raw = building.customer_id;

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching building',
      error: error.message
    });
  }
});

// POST /api/buildings - Create new building
router.post('/', checkModulePermission('buildings', 'create'), async (req, res) => {
  try {
    // Validation for new fields
    const errors = [];

    // Primary Use - Required field (Mongoose will handle this, but we can add explicit check)
    if (!req.body.primary_use) {
      errors.push('Primary use is required');
    }

    // Last Inspection Date - Optional, validate date format if provided
    if (req.body.last_inspection_date) {
      const inspectionDate = new Date(req.body.last_inspection_date);
      if (isNaN(inspectionDate.getTime())) {
        errors.push('Invalid last inspection date format');
      }
    }

    // Accessibility Features - Optional array validation
    if (req.body.accessibility_features && !Array.isArray(req.body.accessibility_features)) {
      errors.push('Accessibility features must be an array');
    }

    // Parking Spaces - Optional, validate minimum value
    if (req.body.parking_spaces !== undefined && req.body.parking_spaces < 0) {
      errors.push('Parking spaces must be 0 or greater');
    }

    // Tags validation - Optional array of strings
    if (req.body.tags) {
      if (!Array.isArray(req.body.tags)) {
        errors.push('Tags must be an array');
      } else {
        // Validate each tag
        const invalidTags = req.body.tags.filter(tag =>
          typeof tag !== 'string' ||
          tag.trim().length < 2 ||
          tag.trim().length > 30 ||
          !/^[a-zA-Z0-9\s\-_]+$/.test(tag.trim())
        );
        if (invalidTags.length > 0) {
          errors.push('Tags must be 2-30 characters and contain only letters, numbers, spaces, hyphens, and underscores');
        }
        if (req.body.tags.length > 20) {
          errors.push('Maximum 20 tags allowed per building');
        }
      }
    }

    // Address validation
    if (req.body.address) {
      // Validate postcode format if provided
      if (req.body.address.postcode && !/^\d{4}$/.test(req.body.address.postcode)) {
        errors.push('Postcode must be 4 digits');
      }
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
        message: 'Tenant context required to create building'
      });
    }

    // Auto-populate parent entity IDs using hierarchy resolver
    let buildingData = { ...req.body, tenant_id: tenantId };
    buildingData = await resolveHierarchy(buildingData);

    // Validate customer_id was populated after resolution
    if (!buildingData.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'The selected site is not properly configured. Please contact your administrator to assign a customer to this site.',
        errors: [{
          field: 'site_id',
          message: 'Site does not have a valid customer assignment'
        }]
      });
    }

    // Create building with resolved hierarchy
    const building = new Building(buildingData);
    await building.save();

    // Populate the created building before returning
    await building.populate('site_id', 'site_name address');
    await building.populate('customer_id', 'organisation.organisation_name');

    // Log audit for building creation
    logCreate({ module: 'building', resourceName: building.building_name, req, moduleId: building._id, resource: building.toObject() });

    res.status(201).json({
      success: true,
      message: 'Building created successfully',
      data: building
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating building',
      error: error.message
    });
  }
});

// PUT /api/buildings/:id - Update building
router.put('/:id', checkResourcePermission('building', 'edit', (req) => req.params.id), requireIfMatch, async (req, res) => {
  try {
    // Validation for new fields
    const errors = [];

    // Last Inspection Date - Optional, validate date format if provided
    if (req.body.last_inspection_date) {
      const inspectionDate = new Date(req.body.last_inspection_date);
      if (isNaN(inspectionDate.getTime())) {
        errors.push('Invalid last inspection date format');
      }
    }

    // Accessibility Features - Optional array validation
    if (req.body.accessibility_features && !Array.isArray(req.body.accessibility_features)) {
      errors.push('Accessibility features must be an array');
    }

    // Parking Spaces - Optional, validate minimum value
    if (req.body.parking_spaces !== undefined && req.body.parking_spaces < 0) {
      errors.push('Parking spaces must be 0 or greater');
    }

    // Tags validation - Optional array of strings
    if (req.body.tags) {
      if (!Array.isArray(req.body.tags)) {
        errors.push('Tags must be an array');
      } else {
        // Validate each tag
        const invalidTags = req.body.tags.filter(tag =>
          typeof tag !== 'string' ||
          tag.trim().length < 2 ||
          tag.trim().length > 30 ||
          !/^[a-zA-Z0-9\s\-_]+$/.test(tag.trim())
        );
        if (invalidTags.length > 0) {
          errors.push('Tags must be 2-30 characters and contain only letters, numbers, spaces, hyphens, and underscores');
        }
        if (req.body.tags.length > 20) {
          errors.push('Maximum 20 tags allowed per building');
        }
      }
    }

    // Address validation
    if (req.body.address) {
      // Validate postcode format if provided
      if (req.body.address.postcode && !/^\d{4}$/.test(req.body.address.postcode)) {
        errors.push('Postcode must be 4 digits');
      }
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
        message: 'Tenant context required to update building'
      });
    }

    // Get version from If-Match header or request body (parsed by requireIfMatch middleware)
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include If-Match header or __v in body for concurrent write safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Load building document (tenant-scoped automatically via plugin)
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or you do not have permission to update it'
      });
    }

    // Verify tenant ownership
    if (building.tenant_id && building.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Building belongs to a different tenant'
      });
    }

    // Check version match for optimistic concurrency control
    if (building.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: building.__v,
        resource: 'Building',
        id: req.params.id
      });
    }

    // Auto-populate parent entity IDs using hierarchy resolver
    let updateData = { ...req.body };
    updateData = await resolveHierarchy(updateData);

    // Validate customer_id was populated after resolution (if site_id was provided)
    if (updateData.site_id && !updateData.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'The selected site is not properly configured. Please contact your administrator to assign a customer to this site.',
        errors: [{
          field: 'site_id',
          message: 'Site does not have a valid customer assignment'
        }]
      });
    }

    // Prevent updating tenant_id
    delete updateData.tenant_id;

    // Build atomic update object - filter out undefined/null to preserve existing data
    const allowedFields = ['building_name', 'building_code', 'site_id', 'site_name', 'customer_id',
      'building_type', 'operational_status', 'status', 'is_active', 'address', 'coordinates',
      'total_floors', 'total_area', 'year_built', 'contact_info', 'number_of_floors',
      'nabers_rating', 'primary_use', 'last_inspection_date', 'accessibility_features',
      'parking_spaces', 'latitude', 'longitude', 'manager', 'metadata', 'tags'];
    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });
    
    // Add updated_at
    atomicUpdate.updated_at = new Date().toISOString();

    // Perform atomic update with version check (prevents lost updates)
    const result = await Building.findOneAndUpdate(
      { 
        _id: req.params.id,
        __v: clientVersion  // Version check prevents lost updates
      },
      {
        $set: atomicUpdate,
        $inc: { __v: 1 }  // Atomic version increment
      },
      { new: true, runValidators: true }
    );
    
    if (!result) {
      // Version conflict - resource was modified
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: building.__v,
        resource: 'Building',
        id: req.params.id
      });
    }

    // Log audit for building update
    logUpdate({ module: 'building', resourceName: result.building_name, req, moduleId: result._id, resource: result.toObject() });

    // Add raw IDs to the response for convenience
    const responseData = result.toObject();
    responseData.site_id_raw = result.site_id;
    responseData.customer_id_raw = result.customer_id;

    res.status(200).json({
      success: true,
      message: 'Building updated successfully',
      data: responseData
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating building',
      error: error.message
    });
  }
});

// DELETE /api/buildings/:id - Delete building
router.delete('/:id', checkResourcePermission('building', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete building'
      });
    }

    // Find building (soft delete check)
    const building = await Building.findOne({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this building
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or you do not have permission to delete it'
      });
    }

    // Check if already deleted
    if (building.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Building already deleted'
      });
    }

    // Soft delete building
    await Building.findByIdAndUpdate(req.params.id, { is_delete: true });

    // Cascade soft delete to all children (floors, assets, building tenants)
    const { cascadeBuildingDelete } = require('../utils/softDeleteCascade');
    await cascadeBuildingDelete(req.params.id, tenantId);

    // Log audit for building deletion
    logDelete({ module: 'building', resourceName: building.building_name, req, moduleId: building._id, resource: building.toObject() });

    res.status(200).json({
      success: true,
      message: 'Building deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting building',
      error: error.message
    });
  }
});

// GET /api/buildings/summary/stats - Get building summary statistics
router.get('/summary/stats', checkModulePermission('buildings', 'view'), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to view building statistics'
      });
    }

    const { customer_id, site_id } = req.query;

    // Build match query with mandatory tenant filter
    let matchQuery = {
      tenant_id: tenantId
    };
    
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);

    const stats = await Building.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalBuildings: { $sum: 1 },
          activeBuildings: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          underConstruction: {
            $sum: { $cond: [{ $eq: ['$status', 'Under Construction'] }, 1, 0] }
          },
          totalFloors: { $sum: '$total_floors' },
          totalAssets: { $sum: '$total_assets' },
          avgOccupancy: { $avg: '$avg_occupancy' },
          avgEnergyRating: { $avg: '$energy_rating' }
        }
      }
    ]);

    const result = stats[0] || {
      totalBuildings: 0,
      activeBuildings: 0,
      underConstruction: 0,
      totalFloors: 0,
      totalAssets: 0,
      avgOccupancy: 0,
      avgEnergyRating: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching building statistics',
      error: error.message
    });
  }
});

// GET /api/buildings/by-category - Group buildings by category
router.get('/by-category', checkModulePermission('buildings', 'view'), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to view building categories'
      });
    }

    const { customer_id, site_id } = req.query;

    // Build match query with mandatory tenant filter
    let matchQuery = {
      tenant_id: tenantId
    };
    
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);

    const categoryStats = await Building.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          avgOccupancy: { $avg: '$avg_occupancy' },
          totalAssets: { $sum: '$total_assets' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: categoryStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category statistics',
      error: error.message
    });
  }
});

module.exports = router;