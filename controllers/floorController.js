/**
 * Floor Controller
 * Handles business logic for floor CRUD operations.
 * Extracted from routes/floors.js as part of code cleanup - Clean Architecture
 *
 * @module controllers/floorController
 */

const mongoose = require('mongoose');
const Floor = require('../models/Floor');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { sendVersionConflict } = require('../middleware/etagVersion');
const { resolveHierarchy } = require('../utils/hierarchyLookup');
const { applyResourceFilter } = require('../utils/resourceFilter');
const { uploadFileToS3, generatePresignedUrl } = require('../utils/s3Upload');
const { Parser } = require('json2csv');
const entityLookupService = require('../services/entityLookupService');

/**
 * Validate floor data for create/update operations
 * @param {Object} floorData - Floor data to validate
 * @returns {Object} { isValid: boolean, errors: string[], data: Object }
 */
function validateFloorData(floorData) {
  const errors = [];
  const data = { ...floorData };

  // Handle backward compatibility: occupancy -> maximum_occupancy
  if (data.occupancy !== undefined && data.maximum_occupancy === undefined) {
    data.maximum_occupancy = data.occupancy;
    delete data.occupancy;
  }

  // Ceiling Height - Validate if provided
  if (data.ceiling_height !== undefined && data.ceiling_height < 0) {
    errors.push('Ceiling height must be a positive number');
  }

  // Occupancy Type - Validate enum if provided
  if (data.occupancy_type && !['Single Tenant', 'Multi Tenant', 'Common Area'].includes(data.occupancy_type)) {
    errors.push('Invalid occupancy type');
  }

  // Access Control - Validate enum if provided
  if (data.access_control && !['Public', 'Keycard Required', 'Restricted'].includes(data.access_control)) {
    errors.push('Invalid access control level');
  }

  // HVAC Zones - Validate if provided
  if (data.hvac_zones !== undefined && (data.hvac_zones < 0 || !Number.isInteger(data.hvac_zones))) {
    errors.push('HVAC zones must be a non-negative integer');
  }

  // Special Features - Validate array if provided
  if (data.special_features) {
    if (!Array.isArray(data.special_features)) {
      errors.push('Special features must be an array');
    } else {
      const validFeatures = ['Equipment Room', 'Common Area', 'Server Room', 'Meeting Room', 'Kitchen', 'Storage'];
      const invalidFeatures = data.special_features.filter(f => !validFeatures.includes(f));
      if (invalidFeatures.length > 0) {
        errors.push(`Invalid special features: ${invalidFeatures.join(', ')}`);
      }
    }
  }

  // Maximum Occupancy - Validate if provided
  if (data.maximum_occupancy !== undefined && (data.maximum_occupancy < 0 || !Number.isInteger(data.maximum_occupancy))) {
    errors.push('Maximum occupancy must be a non-negative integer');
  }

  return {
    isValid: errors.length === 0,
    errors,
    data
  };
}

/**
 * List all floors with pagination and search
 * GET /api/floors
 */
const list = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

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

    let filterQuery = {
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    };

    filterQuery = await applyResourceFilter(req, filterQuery, 'floor');

    if (search) {
      filterQuery.$or = [
        { floor_name: new RegExp(search, 'i') }
      ];
    }

    if (customer_id) {
      const customerIds = customer_id.split(',').map(id => id.trim());
      filterQuery.customer_id = { $in: customerIds };
    }

    if (site_id) {
      const siteIds = site_id.split(',').map(id => id.trim());
      filterQuery.site_id = { $in: siteIds };
    }

    if (building_id) {
      const buildingIds = building_id.split(',').map(id => id.trim());
      filterQuery.building_id = { $in: buildingIds };
    }

    if (floor_type) {
      const types = floor_type.includes(',')
        ? floor_type.split(',').map(t => t.trim())
        : floor_type;
      filterQuery.floor_type = Array.isArray(types) ? { $in: types } : types;
    }

    const limit = parseInt(per_page);
    const skip = (parseInt(page) - 1) * limit;

    const sortConfig = {};
    sortConfig[sort_by] = sort_order === 'desc' ? -1 : 1;

    const totalCount = await Floor.countDocuments(filterQuery);

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
};

/**
 * Get single floor by ID
 * GET /api/floors/:id
 */
const getById = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const floor = await Floor.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    })
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
};

/**
 * Create new floor
 * POST /api/floors
 */
const create = async (req, res) => {
  try {
    const validation = validateFloorData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    let floorData = validation.data;

    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to create floor'
      });
    }

    floorData = await resolveHierarchy(floorData);

    if (!floorData.customer_id || floorData.customer_id === '') {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a customer to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    if (!floorData.site_id || floorData.site_id === '') {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a site to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid site assignment'
        }]
      });
    }

    const customer = await Customer.findById(floorData.customer_id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const site = await Site.findById(floorData.site_id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    floorData.tenant_id = tenantId;

    const floor = new Floor(floorData);
    await floor.save();

    await floor.populate('customer_id', 'organisation.organisation_name');
    await floor.populate('site_id', 'site_name address');
    await floor.populate('building_id', 'building_name building_code');

    logCreate({ module: 'floor', resourceName: floor.floor_name, req, moduleId: floor._id, resource: floor.toObject() });

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
};

/**
 * Update floor
 * PUT /api/floors/:id
 */
const update = async (req, res) => {
  try {
    const validation = validateFloorData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    let floorData = validation.data;

    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update floor'
      });
    }

    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include If-Match header or __v in body for concurrent write safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    const floor = await Floor.findById(req.params.id);
    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found or you do not have permission to update it'
      });
    }

    if (floor.tenant_id && floor.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Floor belongs to a different tenant'
      });
    }

    if (floor.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: floor.__v,
        resource: 'Floor',
        id: req.params.id
      });
    }

    if (floorData.building_id &&
        floorData.building_id !== floor.building_id?.toString()) {
      floorData = await resolveHierarchy(floorData);
    } else if ((!floorData.customer_id || floorData.customer_id === '') ||
               (!floorData.site_id || floorData.site_id === '')) {
      floorData = await resolveHierarchy(floorData);
    } else {
      floorData.customer_id = floorData.customer_id || floor.customer_id;
      floorData.site_id = floorData.site_id || floor.site_id;
    }

    if (!floorData.customer_id || floorData.customer_id === '') {
      return res.status(400).json({
        success: false,
        message: 'Building is not properly configured',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    if (!floorData.site_id || floorData.site_id === '') {
      return res.status(400).json({
        success: false,
        message: 'Building is not properly configured',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid site assignment'
        }]
      });
    }

    const safeFloorData = { ...floorData };
    delete safeFloorData.tenant_id;

    const allowedFields = ['floor_name', 'floor_number', 'floor_level', 'site_id', 'building_id',
      'customer_id', 'floor_type', 'total_area', 'status', 'is_active', 'description', 'contact_info'];
    const atomicUpdate = {};
    Object.keys(safeFloorData).forEach(key => {
      if (safeFloorData[key] !== undefined && safeFloorData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = safeFloorData[key];
      }
    });

    atomicUpdate.updated_at = new Date().toISOString();

    const result = await Floor.findOneAndUpdate(
      {
        _id: req.params.id,
        __v: clientVersion
      },
      {
        $set: atomicUpdate,
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: floor.__v,
        resource: 'Floor',
        id: req.params.id
      });
    }

    await result.populate('site_id', 'site_name address');
    await result.populate('building_id', 'building_name building_code');
    await result.populate('customer_id', 'organisation.organisation_name');

    logUpdate({ module: 'floor', resourceName: result.floor_name, req, moduleId: result._id, resource: result.toObject() });

    res.status(200).json({
      success: true,
      message: 'Floor updated successfully',
      data: result
    });
  } catch (error) {
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Floor',
        id: req.params.id
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating floor',
      error: error.message
    });
  }
};

/**
 * Delete floor (soft delete)
 * DELETE /api/floors/:id
 */
const remove = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete floor'
      });
    }

    const floor = await Floor.findOne({
      _id: req.params.id,
      tenant_id: tenantId
    });

    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found or you do not have permission to delete it'
      });
    }

    if (floor.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Floor already deleted'
      });
    }

    await Floor.findByIdAndUpdate(req.params.id, { is_delete: true });

    const { cascadeFloorDelete } = require('../utils/softDeleteCascade');
    await cascadeFloorDelete(req.params.id, tenantId);

    logDelete({ module: 'floor', resourceName: floor.floor_name, req, moduleId: floor._id, resource: floor.toObject() });

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
};

/**
 * Get floors by building
 * GET /api/floors/by-building/:buildingId
 */
const getByBuilding = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const floors = await Floor.find({
      building_id: req.params.buildingId,
      tenant_id: req.tenant.tenantId
    })
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
};

/**
 * Get floor summary statistics
 * GET /api/floors/summary/stats
 */
const getStats = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {
      tenant_id: req.tenant.tenantId
    };

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
};

/**
 * Get floors grouped by type
 * GET /api/floors/by-type
 */
const getByType = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {
      tenant_id: req.tenant.tenantId
    };

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
};

/**
 * Export floors to CSV
 * POST /api/floors/export
 */
const exportToCsv = async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_type,
      status,
      occupancy_type
    } = req.body;

    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    let filterQuery = {
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    };

    const filteredQuery = await applyResourceFilter(req, filterQuery, 'floor');

    if (customer_id && customer_id !== 'all') filteredQuery.customer_id = customer_id;
    if (site_id && site_id !== 'all') filteredQuery.site_id = site_id;
    if (building_id && building_id !== 'all') filteredQuery.building_id = building_id;
    if (floor_type && floor_type !== 'all') filteredQuery.floor_type = floor_type;
    if (status && status !== 'all') filteredQuery.status = status;
    if (occupancy_type && occupancy_type !== 'all') filteredQuery.occupancy_type = occupancy_type;

    const floors = await Floor.find(filteredQuery)
      .select('floor_name floor_number floor_type maximum_occupancy occupancy_type access_control fire_compartment hvac_zones special_features area_number area_unit floor_area floor_area_unit ceiling_height ceiling_height_unit status assets_count customer_id site_id building_id createdAt updatedAt')
      .lean();

    if (!floors || floors.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No floors found to export',
        data: { total_records: 0 }
      });
    }

    const enrichedFloors = await entityLookupService.batchFetchFloorEntityNames(floors, req.tenant.tenantId);

    const csvData = enrichedFloors.map(floor => ({
      'Floor Name': floor.floor_name || '',
      'Floor Number': floor.floor_number || '',
      'Floor Type': floor.floor_type || '',
      'Maximum Occupancy': floor.maximum_occupancy || 0,
      'Occupancy Type': floor.occupancy_type || '',
      'Access Control': floor.access_control || '',
      'Fire Compartment': floor.fire_compartment || '',
      'HVAC Zones': floor.hvac_zones || '',
      'Special Features': Array.isArray(floor.special_features) ? floor.special_features.join(', ') : '',
      'Area Number': floor.area_number || '',
      'Area Unit': floor.area_unit || '',
      'Floor Area': floor.floor_area || '',
      'Floor Area Unit': floor.floor_area_unit || '',
      'Ceiling Height': floor.ceiling_height || '',
      'Ceiling Height Unit': floor.ceiling_height_unit || '',
      'Status': floor.status || '',
      'Assets Count': floor.assets_count || 0,
      'Customer': floor.customer_name || '',
      'Site': floor.site_name || '',
      'Building': floor.building_name || '',
      'Created Date': floor.createdAt ? new Date(floor.createdAt).toLocaleDateString('en-AU') : '',
      'Updated Date': floor.updatedAt ? new Date(floor.updatedAt).toLocaleDateString('en-AU') : ''
    }));

    const fields = [
      'Floor Name', 'Floor Number', 'Floor Type', 'Maximum Occupancy', 'Occupancy Type',
      'Access Control', 'Fire Compartment', 'HVAC Zones', 'Special Features',
      'Area Number', 'Area Unit', 'Floor Area', 'Floor Area Unit',
      'Ceiling Height', 'Ceiling Height Unit', 'Status', 'Assets Count',
      'Customer', 'Site', 'Building', 'Created Date', 'Updated Date'
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const filename = `exports/floors_export_${timestamp}_${date}.csv`;
    const csvBuffer = Buffer.from(csv, 'utf-8');

    const csvFile = {
      buffer: csvBuffer,
      originalname: filename.split('/').pop(),
      mimetype: 'text/csv',
      size: csvBuffer.length
    };

    const s3Result = await uploadFileToS3(csvFile, 'exports', `exports`);

    if (!s3Result.success) {
      throw new Error('Failed to upload CSV to S3: ' + s3Result.error);
    }

    const presignedUrlResult = await generatePresignedUrl(s3Result.data.file_meta.file_key, 3600);

    if (!presignedUrlResult.success) {
      throw new Error('Failed to generate presigned URL: ' + presignedUrlResult.error);
    }

    res.status(200).json({
      success: true,
      message: `Successfully exported ${enrichedFloors.length} floors`,
      data: {
        file_url: presignedUrlResult.url,
        file_name: filename.split('/').pop(),
        total_records: enrichedFloors.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Floor export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export floors',
      error: error.message
    });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getByBuilding,
  getStats,
  getByType,
  exportToCsv,
  validateFloorData
};
