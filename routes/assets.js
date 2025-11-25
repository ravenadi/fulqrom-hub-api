const express = require('express');
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');
const { validateCreateAsset, validateUpdateAsset } = require('../middleware/assetValidation');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');
const { resolveHierarchy } = require('../utils/hierarchyLookup');
const { applyResourceFilter } = require('../utils/resourceFilter');
const { uploadFileToS3, generatePresignedUrl } = require('../utils/s3Upload');
const { Parser } = require('json2csv');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const router = express.Router();

// Configure multer for CSV file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// GET /api/assets - List all assets
router.get('/', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      category,
      status,
      condition,
      criticality_level,
      make,
      model,
      level,
      area,
      device_id,
      asset_no,
      asset_id,
      refrigerant,
      owner,
      service_status,
      age_min,
      age_max,
      purchase_cost_min,
      purchase_cost_max,
      current_value_min,
      current_value_max,
      test_result,
      is_active,
      search,
      page = 1,
      limit = 50,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    // Build filter query with mandatory tenant filter
    let filterQuery = {
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }  // Exclude soft-deleted records
    };

    // Apply resource-level filtering based on user's permissions
    filterQuery = await applyResourceFilter(req, filterQuery, 'asset');

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filterQuery.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }

    if (site_id) {
      // Support multiple site IDs (comma-separated)
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filterQuery.site_id = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }

    if (building_id) {
      // Support multiple building IDs (comma-separated)
      const buildingIds = building_id.includes(',')
        ? building_id.split(',').map(id => id.trim())
        : building_id;
      filterQuery.building_id = Array.isArray(buildingIds) ? { $in: buildingIds } : buildingIds;
    }

    if (floor_id) {
      // Support multiple floor IDs (comma-separated)
      const floorIds = floor_id.includes(',')
        ? floor_id.split(',').map(id => id.trim())
        : floor_id;
      filterQuery.floor_id = Array.isArray(floorIds) ? { $in: floorIds } : floorIds;
    }

    if (category) {
      // Support multiple categories (comma-separated)
      const categories = category.includes(',')
        ? category.split(',').map(cat => cat.trim())
        : category;
      filterQuery.category = Array.isArray(categories) ? { $in: categories } : categories;
    }

    if (status) {
      // Support multiple statuses (comma-separated)
      const statuses = status.includes(',')
        ? status.split(',').map(s => s.trim())
        : status;
      filterQuery.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }

    // condition and criticality_level both are same.

    if (condition) {
      // Support multiple conditions (comma-separated)
      const conditions = condition.includes(',')
        ? condition.split(',').map(c => c.trim())
        : condition;
      filterQuery.condition = Array.isArray(conditions) ? { $in: conditions } : conditions;
    }

    if (criticality_level) {
      // Support multiple criticality levels (comma-separated)
      const criticalityLevels = criticality_level.includes(',')
        ? criticality_level.split(',').map(c => c.trim())
        : criticality_level;
      filterQuery.criticality_level = Array.isArray(criticalityLevels) ? { $in: criticalityLevels } : criticalityLevels;
    }

    if (make) {
      filterQuery.make = new RegExp(make, 'i');
    }

    if (model) {
      filterQuery.model = new RegExp(model, 'i');
    }

    if (level) {
      filterQuery.level = level;
    }

    if (area) {
      filterQuery.area = new RegExp(area, 'i');
    }

    if (device_id) {
      filterQuery.device_id = device_id;
    }

    if (asset_no) {
      filterQuery.asset_no = new RegExp(asset_no, 'i');
    }

    if (asset_id) {
      filterQuery.asset_id = asset_id;
    }

    if (refrigerant) {
      filterQuery.refrigerant = new RegExp(refrigerant, 'i');
    }

    if (owner) {
      filterQuery.owner = new RegExp(owner, 'i');
    }

    if (service_status) {
      filterQuery.service_status = service_status;
    }

    if (age_min || age_max) {
      filterQuery.age = {};
      if (age_min) filterQuery.age.$gte = parseInt(age_min);
      if (age_max) filterQuery.age.$lte = parseInt(age_max);
    }

    if (purchase_cost_min || purchase_cost_max) {
      filterQuery.purchase_cost_aud = {};
      if (purchase_cost_min) filterQuery.purchase_cost_aud.$gte = parseFloat(purchase_cost_min);
      if (purchase_cost_max) filterQuery.purchase_cost_aud.$lte = parseFloat(purchase_cost_max);
    }

    if (current_value_min || current_value_max) {
      filterQuery.current_book_value_aud = {};
      if (current_value_min) filterQuery.current_book_value_aud.$gte = parseFloat(current_value_min);
      if (current_value_max) filterQuery.current_book_value_aud.$lte = parseFloat(current_value_max);
    }

    if (test_result) {
      filterQuery.last_test_result = test_result;
    }

    // Text search across multiple fields
    if (search) {
      filterQuery.$or = [
        { asset_no: new RegExp(search, 'i') },
        { asset_id: new RegExp(search, 'i') },
        { device_id: new RegExp(search, 'i') },
        { make: new RegExp(search, 'i') },
        { model: new RegExp(search, 'i') },
        { serial: new RegExp(search, 'i') },
        { area: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') },
        { type: new RegExp(search, 'i') },
        { status: new RegExp(search, 'i') },
        { criticality_level: new RegExp(search, 'i') },
        { owner: new RegExp(search, 'i') },
        { service_status: new RegExp(search, 'i') }
      ];
    }

    // DB has "status": "Active",
    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200); // Max 200 per page
    const skip = (pageNumber - 1) * limitNumber;

    // Sort configuration
    const validSortFields = [
      'createdAt', 'updatedAt', 'asset_no', 'asset_id', 'device_id',
      'category', 'status', 'condition', 'criticality_level',
      'make', 'model',
      'level', 'area', 'age',
      'purchase_cost_aud', 'current_book_value_aud'
    ];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'createdAt';
    const sortDirection = sort_order === 'asc' ? 1 : -1;

    // Get total count for pagination (with tenant filtering)
    const totalAssets = await Asset.countDocuments(filterQuery).setOptions({ _tenantId: req.tenant.tenantId });

    // Get paginated assets (with tenant filtering)
    const assets = await Asset.find(filterQuery)
      .setOptions({ _tenantId: req.tenant.tenantId })
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name address')
      .populate('building_id', 'building_name building_code')
      .populate('floor_id', 'floor_name floor_level')
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Get document counts for each asset
    const assetIds = assets.map(asset => asset._id.toString());
    
    // Count documents from both legacy single asset and new multiple assets array
    const documentCounts = await Document.aggregate([
      {
        $match: {
          $or: [
            { 'location.asset.asset_id': { $in: assetIds } },  // Legacy single asset
            { 'location.assets.asset_id': { $in: assetIds } }   // New multiple assets array
          ]
        }
      },
      {
        // Unwind the assets array to count each asset separately
        $facet: {
          legacyAssets: [
            { $match: { 'location.asset.asset_id': { $in: assetIds } } },
            { $group: { _id: '$location.asset.asset_id', count: { $sum: 1 } } }
          ],
          multipleAssets: [
            { $match: { 'location.assets.asset_id': { $in: assetIds } } },
            { $unwind: '$location.assets' },
            { $match: { 'location.assets.asset_id': { $in: assetIds } } },
            { $group: { _id: '$location.assets.asset_id', count: { $sum: 1 } } }
          ]
        }
      },
      {
        // Combine both results
        $project: {
          combined: { $concatArrays: ['$legacyAssets', '$multipleAssets'] }
        }
      },
      { $unwind: '$combined' },
      {
        $group: {
          _id: '$combined._id',
          count: { $sum: '$combined.count' }
        }
      }
    ]);

    // Create a map of asset_id to document count
    const documentCountMap = {};
    documentCounts.forEach(item => {
      documentCountMap[item._id] = item.count;
    });

    // Add document count and backward compatibility fields to each asset
    const assetsWithDocCount = assets.map(asset => ({
      ...asset,
      document_count: documentCountMap[asset._id.toString()] || 0,
      // Add backward compatibility fields for frontend
      purchase_cost: asset.purchase_cost_aud || asset.purchase_cost || undefined,
      current_book_value: asset.current_book_value_aud || asset.current_book_value || undefined,
      weight: asset.weight_kgs || asset.weight || undefined,
      installation_date: asset.date_of_installation || asset.installation_date || undefined
    }));

    // Calculate summary statistics (on filtered data, not paginated) with tenant filtering
    const summaryStats = await Asset.withTenant(req.tenant.tenantId).aggregate([
      { $match: filterQuery },
      {
        $group: {
          _id: null,
          total_assets: { $sum: 1 },
          active_assets: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          operational_assets: {
            $sum: { $cond: [{ $eq: ['$status', 'Operational'] }, 1, 0] }
          },
          good_condition: {
            $sum: { $cond: [{ $eq: ['$condition', 'Good'] }, 1, 0] }
          },
          poor_condition: {
            $sum: { $cond: [{ $eq: ['$condition', 'Poor'] }, 1, 0] }
          },
          needs_maintenance: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$status', 'Maintenance Required'] },
                    { $eq: ['$condition', 'Poor'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const summary = summaryStats[0] || {
      total_assets: 0,
      active_assets: 0,
      operational_assets: 0,
      good_condition: 0,
      poor_condition: 0,
      needs_maintenance: 0
    };

    // Pagination metadata
    const totalPages = Math.ceil(totalAssets / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    res.status(200).json({
      success: true,
      data: assetsWithDocCount,
      pagination: {
        current_page: pageNumber,
        per_page: limitNumber,
        total_items: totalAssets,
        total_pages: totalPages,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
        next_page: hasNextPage ? pageNumber + 1 : null,
        prev_page: hasPrevPage ? pageNumber - 1 : null
      },
      summary: summary,
      filters_applied: {
        customer_id: customer_id || null,
        site_id: site_id || null,
        building_id: building_id || null,
        floor_id: floor_id || null,
        category: category || null,
        status: status || null,
        condition: condition || null,
        criticality_level: criticality_level || null,
        make: make || null,
        model: model || null,
        level: level || null,
        area: area || null,
        device_id: device_id || null,
        asset_no: asset_no || null,
        asset_id: asset_id || null,
        refrigerant: refrigerant || null,
        owner: owner || null,
        service_status: service_status || null,
        age_range: (age_min || age_max) ? `${age_min || 0}-${age_max || '∞'}` : null,
        purchase_cost_range: (purchase_cost_min || purchase_cost_max) ? `$${purchase_cost_min || 0}-${purchase_cost_max || '∞'}` : null,
        current_value_range: (current_value_min || current_value_max) ? `$${current_value_min || 0}-${current_value_max || '∞'}` : null,
        test_result: test_result || null,
        search: search || null,
        is_active: is_active || null
      },
      sort: {
        field: sortField,
        order: sort_order
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching assets',
      error: error.message
    });
  }
});

// GET /api/assets/:id - Get single asset
router.get('/:id', checkResourcePermission('asset', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const asset = await Asset.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }  // Exclude soft-deleted records
    })
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address')
      .populate('building_id', 'building_name building_code')
      .populate('floor_id', 'floor_name floor_level');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Convert to plain object
    const assetObj = asset.toObject();

    // Get version or default to 0 for documents that don't have __v yet
    // This handles legacy documents created before version tracking
    const version = asset.__v !== undefined ? asset.__v :
                   (asset._doc?.__v !== undefined ? asset._doc.__v : 0);

    // Add backward compatibility fields for frontend
    const assetWithCompatibility = {
      ...assetObj,
      __v: version, // Always include version (0 for legacy documents)
      purchase_cost: assetObj.purchase_cost_aud || assetObj.purchase_cost || undefined,
      current_book_value: assetObj.current_book_value_aud || assetObj.current_book_value || undefined,
      weight: assetObj.weight_kgs || assetObj.weight || undefined,
      installation_date: assetObj.date_of_installation || assetObj.installation_date || undefined
    };

    res.status(200).json({
      success: true,
      data: assetWithCompatibility
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching asset',
      error: error.message
    });
  }
});

// POST /api/assets - Create new asset
router.post('/', checkModulePermission('assets', 'create'), validateCreateAsset, async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    let { customer_id, site_id, building_id, floor_id, ...otherFields } = req.body;

    // Auto-populate parent entity IDs from child entities (hierarchy resolution)
    const hierarchyData = await resolveHierarchy({
      customer_id,
      site_id,
      building_id,
      floor_id
    });

    // Extract resolved IDs
    customer_id = hierarchyData.customer_id;
    site_id = hierarchyData.site_id;
    building_id = hierarchyData.building_id;
    floor_id = hierarchyData.floor_id;

    // Validate customer_id was populated (either provided or resolved)
    if (!customer_id || customer_id === '') {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a customer to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    // Validate customer exists
    const customer = await Customer.findById(customer_id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        errors: [{
          field: 'customer_id',
          message: 'The specified customer does not exist'
        }]
      });
    }

    // Handle legacy field mapping for backward compatibility
    const assetData = {
      customer_id,
      site_id: site_id || null,
      building_id: building_id || null,
      floor_id: floor_id || null,
      tenant_id: req.tenant.tenantId, // Ensure tenant_id is set
      ...otherFields
    };

    // Map legacy fields to new field names if provided
    if (otherFields.installation_date && !otherFields.date_of_installation) {
      assetData.date_of_installation = otherFields.installation_date;
    }
    if (otherFields.acquisition_cost && !otherFields.purchase_cost_aud) {
      assetData.purchase_cost_aud = otherFields.acquisition_cost;
    }
    if (otherFields.current_value && !otherFields.current_book_value_aud) {
      assetData.current_book_value_aud = otherFields.current_value;
    }
    if (otherFields.purchase_cost && !otherFields.purchase_cost_aud) {
      assetData.purchase_cost_aud = otherFields.purchase_cost;
    }
    if (otherFields.current_book_value && !otherFields.current_book_value_aud) {
      assetData.current_book_value_aud = otherFields.current_book_value;
    }
    if (otherFields.weight && !otherFields.weight_kgs) {
      assetData.weight_kgs = otherFields.weight;
    }

    const asset = new Asset(assetData);
    await asset.save();

    // Populate references before returning
    await asset.populate('customer_id', 'organisation.organisation_name');
    await asset.populate('site_id', 'site_name address');

    // Populate remaining references
    await asset.populate('building_id', 'building_name building_code');
    await asset.populate('floor_id', 'floor_name floor_level');

    // Log audit for asset creation
    logCreate({ module: 'asset', resourceName: asset.asset_no || asset.category, req, moduleId: asset._id, resource: asset.toObject() });

    // Convert to plain object and add backward compatibility fields
    const assetObj = asset.toObject();
    const assetWithCompatibility = {
      ...assetObj,
      purchase_cost: assetObj.purchase_cost_aud || assetObj.purchase_cost || undefined,
      current_book_value: assetObj.current_book_value_aud || assetObj.current_book_value || undefined,
      weight: assetObj.weight_kgs || assetObj.weight || undefined,
      installation_date: assetObj.date_of_installation || assetObj.installation_date || undefined
    };

    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      data: assetWithCompatibility
    });
  } catch (error) {
    // Check for duplicate asset_no error
    if (error.code === 11000 && error.keyPattern?.asset_no) {
      return res.status(400).json({
        success: false,
        message: 'Asset number already exists for this customer',
        error: 'Duplicate asset_no'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error creating asset',
      error: error.message
    });
  }
});

// PUT /api/assets/:id - Update asset
router.put('/:id', checkResourcePermission('asset', 'edit', (req) => req.params.id), requireIfMatch, validateUpdateAsset, async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update asset'
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

    // Load asset document (tenant-scoped automatically via plugin)
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found or you do not have permission to update it'
      });
    }

    // Verify tenant ownership
    if (asset.tenant_id && asset.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Asset belongs to a different tenant'
      });
    }

    // Check version match for optimistic concurrency control
    // Handle legacy documents that don't have __v (treat as version 0)
    const currentVersion = asset.__v !== undefined ? asset.__v : 0;

    if (currentVersion !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: currentVersion,
        resource: 'Asset',
        id: req.params.id
      });
    }

    let { customer_id, site_id, building_id, floor_id, ...otherFields } = req.body;

    // Auto-populate parent entity IDs from child entities (hierarchy resolution)
    const hierarchyData = await resolveHierarchy({
      customer_id,
      site_id,
      building_id,
      floor_id
    });

    // Extract resolved IDs
    customer_id = hierarchyData.customer_id;
    site_id = hierarchyData.site_id;
    building_id = hierarchyData.building_id;
    floor_id = hierarchyData.floor_id;

    // Validate customer_id was populated (either provided or resolved)
    if (customer_id !== undefined && (!customer_id || customer_id === '')) {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a customer to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    // Validate customer exists if customer_id is being updated
    if (customer_id && customer_id !== '') {
      const customer = await Customer.findById(customer_id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
          errors: [{
            field: 'customer_id',
            message: 'The specified customer does not exist'
          }]
        });
      }
    }

    // Prevent tenant_id from being changed
    delete otherFields.tenant_id;

    // Handle legacy field mapping for backward compatibility
    const legacyMappings = {};
    if (otherFields.installation_date && !otherFields.date_of_installation) {
      legacyMappings.date_of_installation = otherFields.installation_date;
      delete otherFields.installation_date;
    }
    if (otherFields.acquisition_cost && !otherFields.purchase_cost_aud) {
      legacyMappings.purchase_cost_aud = otherFields.acquisition_cost;
      delete otherFields.acquisition_cost;
    }
    if (otherFields.current_value && !otherFields.current_book_value_aud) {
      legacyMappings.current_book_value_aud = otherFields.current_value;
      delete otherFields.current_value;
    }
    if (otherFields.purchase_cost && !otherFields.purchase_cost_aud) {
      legacyMappings.purchase_cost_aud = otherFields.purchase_cost;
      delete otherFields.purchase_cost;
    }
    if (otherFields.current_book_value && !otherFields.current_book_value_aud) {
      legacyMappings.current_book_value_aud = otherFields.current_book_value;
      delete otherFields.current_book_value;
    }
    if (otherFields.weight && !otherFields.weight_kgs) {
      legacyMappings.weight_kgs = otherFields.weight;
      delete otherFields.weight;
    }

    // Build atomic update object
    const allowedFields = ['asset_no', 'asset_id', 'device_id', 'name', 'category', 'type', 'subtype',
      'status', 'manufacturer', 'model', 'serial_number', 'date_of_installation',
      'purchase_cost_aud', 'current_book_value_aud', 'weight_kgs', 'description', 'notes',
      'is_active', 'warranty_expiry', 'maintenance_schedule', 'location_details', 'metadata'];
    const atomicUpdate = { ...legacyMappings };
    
    // Add relationship fields if provided
    if (customer_id !== undefined) atomicUpdate.customer_id = customer_id;
    if (site_id !== undefined) atomicUpdate.site_id = site_id || null;
    if (building_id !== undefined) atomicUpdate.building_id = building_id || null;
    if (floor_id !== undefined) atomicUpdate.floor_id = floor_id || null;
    
    // Add other allowed fields
    Object.keys(otherFields).forEach(key => {
      if (otherFields[key] !== undefined && otherFields[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = otherFields[key];
      }
    });
    
    // Add updated_at
    atomicUpdate.updated_at = new Date().toISOString();

    // Perform atomic update with version check (prevents lost updates)
    // Handle legacy documents that don't have __v field
    let result;

    if (currentVersion === 0 && asset.__v === undefined) {
      // Legacy document without __v - initialize versioning
      // First update: set __v to 1 (since we're saving changes)
      result = await Asset.findOneAndUpdate(
        {
          _id: req.params.id,
          __v: { $exists: false } // Only match if __v doesn't exist
        },
        {
          $set: { ...atomicUpdate, __v: 1 } // Initialize __v to 1
        },
        { new: true, runValidators: true }
      );
    } else {
      // Normal version-controlled update
      result = await Asset.findOneAndUpdate(
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
    }
    
    if (!result) {
      // Version conflict - resource was modified
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: currentVersion,
        resource: 'Asset',
        id: req.params.id
      });
    }

    // Populate relationships for response (after save)
    await result.populate('customer_id', 'organisation.organisation_name');
    await result.populate('site_id', 'site_name address');
    await result.populate('building_id', 'building_name building_code');
    await result.populate('floor_id', 'floor_name floor_level');

    // Convert to plain object for response
    const assetPlain = result.toObject();

    // Log audit for asset update
    logUpdate({ module: 'asset', resourceName: result.asset_no || result.category, req, moduleId: result._id.toString(), resource: assetPlain });
    
    // Emit socket notification for real-time updates
    const socketManager = require('../utils/socketManager');
    socketManager.emitAssetUpdate(result._id.toString(), {
      tenant_id: result.tenant_id?.toString(),
      updatedBy: req.user?.name || req.user?.email || 'Unknown user',
      asset_no: result.asset_no,
      asset_name: result.name || result.asset_no,
      category: result.category,
      updatedAt: result.updated_at || new Date().toISOString(),
      version: result.__v
    });

    // Add backward compatibility fields for frontend
    const assetWithCompatibility = {
      ...assetPlain,
      purchase_cost: assetPlain.purchase_cost_aud || assetPlain.purchase_cost || undefined,
      current_book_value: assetPlain.current_book_value_aud || assetPlain.current_book_value || undefined,
      weight: assetPlain.weight_kgs || assetPlain.weight || undefined,
      installation_date: assetPlain.date_of_installation || assetPlain.installation_date || undefined
    };

    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      data: assetWithCompatibility
    });
  } catch (error) {
    // Handle Mongoose VersionError (shouldn't happen with manual check above, but safety net)
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Asset',
        id: req.params.id
      });
    }

    // Check for duplicate asset_no error
    if (error.code === 11000 && error.keyPattern?.asset_no) {
      return res.status(400).json({
        success: false,
        message: 'Asset number already exists for this customer',
        error: 'Duplicate asset_no'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating asset',
      error: error.message
    });
  }
});


// DELETE /api/assets/bulk - Bulk delete assets
router.delete('/bulk', checkModulePermission('assets', 'delete'), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete assets'
      });
    }

    // Validate request body
    const { asset_ids } = req.body;

    if (!asset_ids || !Array.isArray(asset_ids)) {
      return res.status(400).json({
        success: false,
        message: 'asset_ids array is required'
      });
    }

    if (asset_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'asset_ids array cannot be empty'
      });
    }

    // Limit bulk operations to prevent abuse
    const MAX_BULK_DELETE = 100;
    if (asset_ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete more than ${MAX_BULK_DELETE} assets at once. Provided: ${asset_ids.length}`
      });
    }

    // Validate all IDs are valid ObjectIds
    const invalidIds = asset_ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid asset IDs provided',
        invalid_ids: invalidIds
      });
    }

    // Track results
    const results = {
      success: [],
      failed: []
    };

    // Process each asset individually
    // Permission is checked at route level via checkModulePermission('assets', 'delete')
    for (const assetId of asset_ids) {
      try {
        // Get asset to check tenant ownership and deletion status
        const asset = await Asset.findOne({
          _id: assetId,
          tenant_id: tenantId
        });

        if (!asset) {
          results.failed.push({
            id: assetId,
            reason: 'Asset not found or does not belong to your tenant'
          });
          continue;
        }

        // Check if already deleted
        if (asset.is_delete) {
          results.failed.push({
            id: assetId,
            reason: 'Asset already deleted'
          });
          continue;
        }

        // Soft delete asset
        await Asset.findByIdAndUpdate(assetId, { is_delete: true });

        // Log audit for asset deletion
        logDelete({
          module: 'asset',
          resourceName: asset.asset_no || asset.category,
          req,
          moduleId: asset._id,
          resource: asset.toObject()
        });

        // Add to success results
        results.success.push({
          id: assetId,
          asset_no: asset.asset_no,
          category: asset.category
        });

      } catch (error) {
        results.failed.push({
          id: assetId,
          reason: error.message || 'Unknown error occurred'
        });
      }
    }

    // Prepare response
    const totalRequested = asset_ids.length;
    const totalDeleted = results.success.length;
    const totalFailed = results.failed.length;

    res.status(200).json({
      success: true,
      message: `Bulk delete completed: ${totalDeleted} of ${totalRequested} assets deleted`,
      data: {
        total_requested: totalRequested,
        deleted: totalDeleted,
        failed: totalFailed,
        results: results
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error performing bulk delete',
      error: error.message
    });
  }
});

// DELETE /api/assets/:id - Delete asset
router.delete('/:id', checkResourcePermission('asset', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete asset'
      });
    }

    // Get asset before deletion for audit log
    const asset = await Asset.findOne({
      _id: req.params.id,
      tenant_id: tenantId
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found or you do not have permission to delete it'
      });
    }

    // Check if already deleted
    if (asset.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Asset already deleted'
      });
    }

    // Soft delete asset (no cascade needed for assets)
    await Asset.findByIdAndUpdate(req.params.id, { is_delete: true });

    // Log audit for asset deletion
    logDelete({ module: 'asset', resourceName: asset.asset_no || asset.category, req, moduleId: asset._id, resource: asset.toObject() });

    // Store asset info for response
    const deletedAssetInfo = {
      asset_id: asset.asset_id,
      asset_no: asset.asset_no,
      category: asset.category,
      make: asset.make,
      model: asset.model
    };

    res.status(200).json({
      success: true,
      message: 'Asset deleted successfully',
      deleted_asset: deletedAssetInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting asset',
      error: error.message
    });
  }
});

// GET /api/assets/by-building/:buildingId - Get assets by building
router.get('/by-building/:buildingId', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { buildingId } = req.params;
    const {
      category,
      status,
      condition,
      level,
      area,
      make,
      page = 1,
      limit = 50
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid building ID format'
      });
    }

    // Build filter query with mandatory tenant filter
    let filterQuery = { 
      building_id: new mongoose.Types.ObjectId(buildingId),
      tenant_id: req.tenant.tenantId
    };

    if (category) filterQuery.category = category;
    if (status) filterQuery.status = status;
    if (condition) filterQuery.condition = condition;
    if (level) filterQuery.level = level;
    if (area) filterQuery.area = new RegExp(area, 'i');
    if (make) filterQuery.make = new RegExp(make, 'i');

    // Pagination
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200);
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count for pagination
    const totalAssets = await Asset.countDocuments(filterQuery);

    // Get paginated assets
    const assets = await Asset.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .populate('building_id', 'building_name building_code')
      .sort({ level: 1, area: 1, asset_no: 1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Add backward compatibility fields to each asset
    const assetsWithCompatibility = assets.map(asset => ({
      ...asset,
      purchase_cost: asset.purchase_cost_aud || asset.purchase_cost || undefined,
      current_book_value: asset.current_book_value_aud || asset.current_book_value || undefined,
      weight: asset.weight_kgs || asset.weight || undefined,
      installation_date: asset.date_of_installation || asset.installation_date || undefined
    }));

    // Calculate summary statistics
    const summaryStats = await Asset.aggregate([
      { $match: filterQuery },
      {
        $group: {
          _id: null,
          total_assets: { $sum: 1 },
          active_assets: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          operational_assets: { $sum: { $cond: [{ $eq: ['$status', 'Operational'] }, 1, 0] } },
          maintenance_required: { $sum: { $cond: [{ $eq: ['$status', 'Maintenance Required'] }, 1, 0] } },
          good_condition: { $sum: { $cond: [{ $eq: ['$condition', 'Good'] }, 1, 0] } },
          total_value: { $sum: '$current_book_value_aud' },
          avg_age: { $avg: '$age' }
        }
      }
    ]);

    const summary = summaryStats[0] || {
      total_assets: 0,
      active_assets: 0,
      operational_assets: 0,
      maintenance_required: 0,
      good_condition: 0,
      total_value: 0,
      avg_age: 0
    };

    // Pagination metadata
    const totalPages = Math.ceil(totalAssets / limitNumber);

    res.status(200).json({
      success: true,
      count: assetsWithCompatibility.length,
      summary: summary,
      data: assetsWithCompatibility,
      pagination: {
        current_page: pageNumber,
        per_page: limitNumber,
        total_items: totalAssets,
        total_pages: totalPages,
        has_next_page: pageNumber < totalPages,
        has_prev_page: pageNumber > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching assets by building',
      error: error.message
    });
  }
});

// GET /api/assets/by-category - Group assets by category
router.get('/by-category', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { customer_id, site_id, building_id } = req.query;

    // Build match query with mandatory tenant filter
    let matchQuery = {
      tenant_id: req.tenant.tenantId
    };
    
    if (customer_id && mongoose.Types.ObjectId.isValid(customer_id)) {
      matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    }
    if (site_id && mongoose.Types.ObjectId.isValid(site_id)) {
      matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    }
    if (building_id && mongoose.Types.ObjectId.isValid(building_id)) {
      matchQuery.building_id = new mongoose.Types.ObjectId(building_id);
    }

    const categoryStats = await Asset.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          active_count: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          operational_count: { $sum: { $cond: [{ $eq: ['$status', 'Operational'] }, 1, 0] } },
          maintenance_required: { $sum: { $cond: [{ $eq: ['$status', 'Maintenance Required'] }, 1, 0] } },
          good_condition: { $sum: { $cond: [{ $eq: ['$condition', 'Good'] }, 1, 0] } },
          total_value: { $sum: '$current_book_value_aud' },
          avg_age: { $avg: '$age' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: categoryStats.map(stat => ({
        category: stat._id || 'Uncategorized',
        count: stat.count,
        active_count: stat.active_count,
        operational_count: stat.operational_count,
        maintenance_required: stat.maintenance_required,
        good_condition: stat.good_condition,
        total_value: Math.round(stat.total_value || 0),
        avg_age: Math.round(stat.avg_age || 0)
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching assets by category',
      error: error.message
    });
  }
});

// GET /api/assets/summary/stats - Get asset summary statistics
router.get('/summary/stats', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { customer_id, site_id, building_id } = req.query;

    // Build match query with mandatory tenant filter
    let matchQuery = {
      tenant_id: req.tenant.tenantId
    };
    
    if (customer_id && mongoose.Types.ObjectId.isValid(customer_id)) {
      matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    }
    if (site_id && mongoose.Types.ObjectId.isValid(site_id)) {
      matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    }
    if (building_id && mongoose.Types.ObjectId.isValid(building_id)) {
      matchQuery.building_id = new mongoose.Types.ObjectId(building_id);
    }

    const stats = await Asset.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: 1 },
          activeAssets: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          operationalAssets: { $sum: { $cond: [{ $eq: ['$status', 'Operational'] }, 1, 0] } },
          maintenanceRequired: { $sum: { $cond: [{ $eq: ['$status', 'Maintenance Required'] }, 1, 0] } },
          goodCondition: { $sum: { $cond: [{ $eq: ['$condition', 'Good'] }, 1, 0] } },
          fairCondition: { $sum: { $cond: [{ $eq: ['$condition', 'Fair'] }, 1, 0] } },
          poorCondition: { $sum: { $cond: [{ $eq: ['$condition', 'Poor'] }, 1, 0] } },
          totalValue: { $sum: '$current_book_value_aud' },
          totalPurchaseCost: { $sum: '$purchase_cost_aud' },
          avgAge: { $avg: '$age' },
          testsPassed: { $sum: { $cond: [{ $eq: ['$last_test_result', 'Pass'] }, 1, 0] } },
          testsFailed: { $sum: { $cond: [{ $eq: ['$last_test_result', 'Fail'] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || {
      totalAssets: 0,
      activeAssets: 0,
      operationalAssets: 0,
      maintenanceRequired: 0,
      goodCondition: 0,
      fairCondition: 0,
      poorCondition: 0,
      totalValue: 0,
      totalPurchaseCost: 0,
      avgAge: 0,
      testsPassed: 0,
      testsFailed: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching asset statistics',
      error: error.message
    });
  }
});

// Helper function to batch fetch entity names for assets
async function batchFetchEntityNames(assets, tenantId) {
  if (!assets || assets.length === 0) {
    return [];
  }

  // Step 1: Collect all unique IDs from all assets
  const customerIds = new Set();
  const siteIds = new Set();
  const buildingIds = new Set();
  const floorIds = new Set();

  assets.forEach(asset => {
    if (asset.customer_id) customerIds.add(asset.customer_id.toString());
    if (asset.site_id) siteIds.add(asset.site_id.toString());
    if (asset.building_id) buildingIds.add(asset.building_id.toString());
    if (asset.floor_id) floorIds.add(asset.floor_id.toString());
  });

  // Step 2: Batch fetch all entities
  const [customers, sites, buildings, floors] = await Promise.all([
    customerIds.size > 0
      ? Customer.find({ _id: { $in: Array.from(customerIds) }, tenant_id: tenantId })
          .select('_id customer_name')
          .lean()
      : [],
    siteIds.size > 0
      ? Site.find({ _id: { $in: Array.from(siteIds) }, tenant_id: tenantId })
          .select('_id site_name')
          .lean()
      : [],
    buildingIds.size > 0
      ? Building.find({ _id: { $in: Array.from(buildingIds) }, tenant_id: tenantId })
          .select('_id building_name')
          .lean()
      : [],
    floorIds.size > 0
      ? Floor.find({ _id: { $in: Array.from(floorIds) }, tenant_id: tenantId })
          .select('_id floor_name')
          .lean()
      : []
  ]);

  // Step 3: Create lookup maps
  const customerMap = new Map(customers.map(c => [c._id.toString(), c.customer_name]));
  const siteMap = new Map(sites.map(s => [s._id.toString(), s.site_name]));
  const buildingMap = new Map(buildings.map(b => [b._id.toString(), b.building_name]));
  const floorMap = new Map(floors.map(f => [f._id.toString(), f.floor_name]));

  // Step 4: Enrich each asset with entity names
  return assets.map(asset => ({
    ...asset,
    customer_name: asset.customer_id ? customerMap.get(asset.customer_id.toString()) : null,
    site_name: asset.site_id ? siteMap.get(asset.site_id.toString()) : null,
    building_name: asset.building_id ? buildingMap.get(asset.building_id.toString()) : null,
    floor_name: asset.floor_id ? floorMap.get(asset.floor_id.toString()) : null
  }));
}

// POST /api/assets/export - Export assets to CSV
router.post('/export', checkModulePermission('assets', 'export'), async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      category,
      status,
      condition,
      criticality_level,
      service_status
    } = req.body;

    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Build filter query with mandatory tenant filter (ignore 'all' values)
    let filterQuery = {
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    };

    // Apply resource-level filtering based on user's permissions
    const filteredQuery = await applyResourceFilter(req, filterQuery, 'asset');

    if (customer_id && customer_id !== 'all') filteredQuery.customer_id = customer_id;
    if (site_id && site_id !== 'all') filteredQuery.site_id = site_id;
    if (building_id && building_id !== 'all') filteredQuery.building_id = building_id;
    if (floor_id && floor_id !== 'all') filteredQuery.floor_id = floor_id;
    if (category && category !== 'all') filteredQuery.category = category;
    if (status && status !== 'all') filteredQuery.status = status;
    if (condition && condition !== 'all') filteredQuery.condition = condition;
    if (criticality_level && criticality_level !== 'all') filteredQuery.criticality_level = criticality_level;
    if (service_status && service_status !== 'all') filteredQuery.service_status = service_status;

    // Fetch assets
    const assets = await Asset.find(filteredQuery)
      .select('asset_id asset_no device_id category type status condition criticality_level make model serial refrigerant level area owner service_status date_of_installation age last_test_date last_test_result purchase_cost_aud current_book_value_aud weight_kgs customer_id site_id building_id floor_id createdAt updatedAt')
      .lean();

    // Check if there are assets to export
    if (!assets || assets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No assets found to export',
        data: { total_records: 0 }
      });
    }

    // Populate entity names
    const enrichedAssets = await batchFetchEntityNames(assets, req.tenant.tenantId);

    // Transform data for CSV
    const csvData = enrichedAssets.map(asset => ({
      'Asset ID': asset.asset_id || '',
      'Asset No': asset.asset_no || '',
      'Device ID': asset.device_id || '',
      'Category': asset.category || '',
      'Type': asset.type || '',
      'Status': asset.status || '',
      'Condition': asset.condition || '',
      'Criticality Level': asset.criticality_level || '',
      'Make': asset.make || '',
      'Model': asset.model || '',
      'Serial': asset.serial || '',
      'Refrigerant': asset.refrigerant || '',
      'Level': asset.level || '',
      'Area': asset.area || '',
      'Owner': asset.owner || '',
      'Service Status': asset.service_status || '',
      'Installation Date': asset.date_of_installation ? new Date(asset.date_of_installation).toLocaleDateString('en-AU') : '',
      'Age': asset.age || '',
      'Last Test Date': asset.last_test_date ? new Date(asset.last_test_date).toLocaleDateString('en-AU') : '',
      'Last Test Result': asset.last_test_result || '',
      'Purchase Cost (AUD)': asset.purchase_cost_aud || 0,
      'Current Book Value (AUD)': asset.current_book_value_aud || 0,
      'Weight (kg)': asset.weight_kgs || '',
      'Customer': asset.customer_name || '',
      'Site': asset.site_name || '',
      'Building': asset.building_name || '',
      'Floor': asset.floor_name || '',
      'Created Date': asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('en-AU') : '',
      'Updated Date': asset.updatedAt ? new Date(asset.updatedAt).toLocaleDateString('en-AU') : ''
    }));

    // Define CSV fields to ensure consistent column headers
    const fields = [
      'Asset ID',
      'Asset No',
      'Device ID',
      'Category',
      'Type',
      'Status',
      'Condition',
      'Criticality Level',
      'Make',
      'Model',
      'Serial',
      'Refrigerant',
      'Level',
      'Area',
      'Owner',
      'Service Status',
      'Installation Date',
      'Age',
      'Last Test Date',
      'Last Test Result',
      'Purchase Cost (AUD)',
      'Current Book Value (AUD)',
      'Weight (kg)',
      'Customer',
      'Site',
      'Building',
      'Floor',
      'Created Date',
      'Updated Date'
    ];

    // Generate CSV with explicit field definitions
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    // Upload CSV to S3
    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const filename = `exports/assets_export_${timestamp}_${date}.csv`;
    const csvBuffer = Buffer.from(csv, 'utf-8');

    // Create a file object compatible with uploadFileToS3
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

    // Generate presigned URL for download (expires in 1 hour)
    const presignedUrlResult = await generatePresignedUrl(s3Result.data.file_meta.file_key, 3600);

    if (!presignedUrlResult.success) {
      throw new Error('Failed to generate presigned URL: ' + presignedUrlResult.error);
    }

    res.status(200).json({
      success: true,
      message: `Successfully exported ${enrichedAssets.length} assets`,
      data: {
        file_url: presignedUrlResult.url,
        file_name: filename.split('/').pop(),
        total_records: enrichedAssets.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Asset export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export assets',
      error: error.message
    });
  }
});

// POST /api/assets/import - Import assets from CSV
router.post('/import', checkModulePermission('assets', 'create'), upload.single('file'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded. Please upload a file with the field name "file".'
      });
    }

    const results = {
      success: [],
      failed: [],
      total: 0
    };

    // Parse CSV from buffer
    const csvRows = [];
    const bufferStream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      bufferStream
        .pipe(csvParser())
        .on('data', (row) => csvRows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    results.total = csvRows.length;

    if (csvRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or invalid',
        data: results
      });
    }

    // Build entity name lookup maps for the tenant
    const customers = await Customer.find({
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    }).select('_id organisation.organisation_name').lean();

    const sites = await Site.find({
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    }).select('_id site_name').lean();

    const buildings = await Building.find({
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    }).select('_id building_name').lean();

    const floors = await Floor.find({
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    }).select('_id floor_name').lean();

    // Create name-to-ID lookup maps
    const customerMap = new Map(
      customers.map(c => [c.organisation?.organisation_name?.toLowerCase().trim(), c._id.toString()])
    );
    const siteMap = new Map(
      sites.map(s => [s.site_name?.toLowerCase().trim(), s._id.toString()])
    );
    const buildingMap = new Map(
      buildings.map(b => [b.building_name?.toLowerCase().trim(), b._id.toString()])
    );
    const floorMap = new Map(
      floors.map(f => [f.floor_name?.toLowerCase().trim(), f._id.toString()])
    );

    // Helper function to parse Australian date format (DD/MM/YYYY)
    const parseAustralianDate = (dateStr) => {
      if (!dateStr || dateStr.trim() === '') return null;

      const parts = dateStr.trim().split('/');
      if (parts.length !== 3) return null;

      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JavaScript months are 0-indexed
      const year = parseInt(parts[2]);

      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    };

    // Process each row
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const rowNumber = i + 2; // +2 because CSV header is row 1, data starts at row 2

      try {
        // Resolve entity names to IDs
        const customerName = row['Customer']?.toLowerCase().trim();
        const siteName = row['Site']?.toLowerCase().trim();
        const buildingName = row['Building']?.toLowerCase().trim();
        const floorName = row['Floor']?.toLowerCase().trim();

        const customer_id = customerName ? customerMap.get(customerName) : null;
        const site_id = siteName ? siteMap.get(siteName) : null;
        const building_id = buildingName ? buildingMap.get(buildingName) : null;
        const floor_id = floorName ? floorMap.get(floorName) : null;

        // Validate required customer_id
        if (!customer_id) {
          results.failed.push({
            row: rowNumber,
            data: row,
            error: `Customer "${row['Customer']}" not found. Please ensure the customer exists in the system.`
          });
          continue;
        }

        // Parse dates
        const installation_date = parseAustralianDate(row['Installation Date']);
        const last_test_date = parseAustralianDate(row['Last Test Date']);

        // Build asset data object
        const assetData = {
          tenant_id: req.tenant.tenantId,
          customer_id: customer_id,
          site_id: site_id || null,
          building_id: building_id || null,
          floor_id: floor_id || null,

          // Primary Information
          asset_id: row['Asset ID']?.trim() || undefined,
          asset_no: row['Asset No']?.trim() || undefined,
          device_id: row['Device ID']?.trim() || undefined,

          // Classification & Status
          category: row['Category']?.trim() || undefined,
          type: row['Type']?.trim() || undefined,
          status: row['Status']?.trim() || undefined,
          condition: row['Condition']?.trim() || undefined,
          criticality_level: row['Criticality Level']?.trim() || undefined,

          // Details
          make: row['Make']?.trim() || undefined,
          model: row['Model']?.trim() || undefined,
          serial: row['Serial']?.trim() || undefined,

          // HVAC/Refrigerant
          refrigerant: row['Refrigerant']?.trim() || undefined,

          // Location
          level: row['Level']?.trim() || undefined,
          area: row['Area']?.trim() || undefined,

          // Ownership & Service
          owner: row['Owner']?.trim() || undefined,
          service_status: row['Service Status']?.trim() || undefined,

          // Dates & Testing
          date_of_installation: installation_date,
          age: row['Age']?.trim() || undefined,
          last_test_date: last_test_date,
          last_test_result: row['Last Test Result']?.trim() || undefined,

          // Financial Information
          purchase_cost_aud: row['Purchase Cost (AUD)'] ? parseFloat(row['Purchase Cost (AUD)']) : undefined,
          current_book_value_aud: row['Current Book Value (AUD)'] ? parseFloat(row['Current Book Value (AUD)']) : undefined,
          weight_kgs: row['Weight (kg)']?.trim() || undefined,

          is_active: true
        };

        // Remove undefined fields
        Object.keys(assetData).forEach(key => {
          if (assetData[key] === undefined) {
            delete assetData[key];
          }
        });

        // Check for duplicate asset_no among active (non-deleted) assets only
        if (assetData.asset_no) {
          const existingAsset = await Asset.findOne({
            customer_id: customer_id,
            asset_no: assetData.asset_no,
            is_active: true,
            is_delete: { $ne: true }
          });

          if (existingAsset) {
            results.failed.push({
              row: rowNumber,
              data: row,
              error: `Duplicate Asset No: "${assetData.asset_no}" already exists for this customer`
            });
            continue;
          }
        }

        // Create asset
        const asset = new Asset(assetData);
        await asset.save();

        // Log audit for asset creation
        logCreate({
          module: 'asset',
          resourceName: asset.asset_no || asset.category || 'Imported Asset',
          req,
          moduleId: asset._id,
          resource: asset.toObject()
        });

        results.success.push({
          row: rowNumber,
          asset_no: asset.asset_no,
          asset_id: asset._id.toString()
        });

      } catch (error) {
        // Handle duplicate asset_no error
        if (error.code === 11000 && error.keyPattern?.asset_no) {
          results.failed.push({
            row: rowNumber,
            data: row,
            error: `Duplicate Asset No: "${row['Asset No']}" already exists for this customer`
          });
        } else {
          results.failed.push({
            row: rowNumber,
            data: row,
            error: error.message || 'Unknown error occurred'
          });
        }
      }
    }

    // Prepare response
    const successCount = results.success.length;
    const failedCount = results.failed.length;

    res.status(200).json({
      success: true,
      message: `Import completed: ${successCount} assets created, ${failedCount} failed`,
      data: {
        total_rows: results.total,
        imported: successCount,
        failed: failedCount,
        success_records: results.success,
        failed_records: results.failed
      }
    });

  } catch (error) {
    console.error('Asset import error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import assets',
      error: error.message
    });
  }
});

module.exports = router;