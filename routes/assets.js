const express = require('express');
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const { validateCreateAsset, validateUpdateAsset } = require('../middleware/assetValidation');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');

const router = express.Router();

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
        { type: new RegExp(search, 'i') }
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

    const { customer_id, site_id, building_id, floor_id, ...otherFields } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: 'customer_id is required'
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

    const { customer_id, site_id, building_id, floor_id, ...otherFields } = req.body;

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

module.exports = router;