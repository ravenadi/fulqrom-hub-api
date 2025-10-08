const express = require('express');
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const { validateCreateAsset, validateUpdateAsset } = require('../middleware/assetValidation');

const router = express.Router();

// GET /api/assets - List all assets
router.get('/', async (req, res) => {
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

    // Build filter query
    let filterQuery = {};

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

    // Get total count for pagination
    const totalAssets = await Asset.countDocuments(filterQuery);

    // Get paginated assets
    const assets = await Asset.find(filterQuery)
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
    const documentCounts = await Document.aggregate([
      {
        $match: {
          'location.asset.asset_id': { $in: assetIds }
        }
      },
      {
        $group: {
          _id: '$location.asset.asset_id',
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map of asset_id to document count
    const documentCountMap = {};
    documentCounts.forEach(item => {
      documentCountMap[item._id] = item.count;
    });

    // Add document count to each asset
    const assetsWithDocCount = assets.map(asset => ({
      ...asset,
      document_count: documentCountMap[asset._id.toString()] || 0
    }));

    // Calculate summary statistics (on filtered data, not paginated)
    const summaryStats = await Asset.aggregate([
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
router.get('/:id', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
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

    res.status(200).json({
      success: true,
      data: asset
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
router.post('/', validateCreateAsset, async (req, res) => {
  try {
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
    await asset.populate('building_id', 'building_name building_code');
    await asset.populate('floor_id', 'floor_name floor_level');

    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      data: asset
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
router.put('/:id', validateUpdateAsset, async (req, res) => {
  try {
    const { customer_id, site_id, building_id, floor_id, ...otherFields } = req.body;

    // Build update object
    const updateData = {
      ...otherFields
    };

    // Only update these fields if they are provided
    if (customer_id !== undefined) updateData.customer_id = customer_id;
    if (site_id !== undefined) updateData.site_id = site_id || null;
    if (building_id !== undefined) updateData.building_id = building_id || null;
    if (floor_id !== undefined) updateData.floor_id = floor_id || null;

    // Handle legacy field mapping for backward compatibility
    if (otherFields.installation_date && !otherFields.date_of_installation) {
      updateData.date_of_installation = otherFields.installation_date;
    }
    if (otherFields.acquisition_cost && !otherFields.purchase_cost_aud) {
      updateData.purchase_cost_aud = otherFields.acquisition_cost;
    }
    if (otherFields.current_value && !otherFields.current_book_value_aud) {
      updateData.current_book_value_aud = otherFields.current_value;
    }
    if (otherFields.purchase_cost && !otherFields.purchase_cost_aud) {
      updateData.purchase_cost_aud = otherFields.purchase_cost;
    }
    if (otherFields.current_book_value && !otherFields.current_book_value_aud) {
      updateData.current_book_value_aud = otherFields.current_book_value;
    }
    if (otherFields.weight && !otherFields.weight_kgs) {
      updateData.weight_kgs = otherFields.weight;
    }

    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('customer_id', 'organisation.organisation_name')
    .populate('site_id', 'site_name address')
    .populate('building_id', 'building_name building_code')
    .populate('floor_id', 'floor_name floor_level');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      data: asset
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
      message: 'Error updating asset',
      error: error.message
    });
  }
});


// DELETE /api/assets/:id - Delete asset
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Store asset info before deletion for response
    const deletedAssetInfo = {
      asset_id: asset.asset_id,
      asset_no: asset.asset_no,
      category: asset.category,
      make: asset.make,
      model: asset.model
    };

    await Asset.findByIdAndDelete(req.params.id);

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
router.get('/by-building/:buildingId', async (req, res) => {
  try {
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

    // Build filter query
    let filterQuery = { building_id: new mongoose.Types.ObjectId(buildingId) };

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
      .limit(limitNumber);

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
      count: assets.length,
      summary: summary,
      data: assets,
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
router.get('/by-category', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
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
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
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