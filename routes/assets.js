const express = require('express');
const Asset = require('../models/Asset');

const router = express.Router();

// GET /api/assets - List all assets
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      category,
      status,
      condition,
      manufacturer,
      warranty_expired,
      is_active,
      page = 1,
      limit = 50,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      filterQuery.customer_id = customer_id;
    }

    if (site_id) {
      filterQuery.site_id = site_id;
    }

    if (category) {
      filterQuery.category = category;
    }

    if (status) {
      filterQuery.status = status;
    }

    if (condition) {
      filterQuery.condition = condition;
    }

    if (manufacturer) {
      filterQuery.make = new RegExp(manufacturer, 'i');
    }

    if (warranty_expired === 'true') {
      filterQuery.warranty_expiry = { $lt: new Date() };
    } else if (warranty_expired === 'false') {
      filterQuery.warranty_expiry = { $gte: new Date() };
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200); // Max 200 per page
    const skip = (pageNumber - 1) * limitNumber;

    // Sort configuration
    const sortField = ['createdAt', 'updatedAt', 'asset_no', 'asset_id', 'category', 'status', 'condition', 'make'].includes(sort_by) ? sort_by : 'createdAt';
    const sortDirection = sort_order === 'asc' ? 1 : -1;

    // Get total count for pagination
    const totalAssets = await Asset.countDocuments(filterQuery);

    // Get paginated assets
    const assets = await Asset.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNumber);

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
      data: assets,
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
        category: category || null,
        status: status || null,
        condition: condition || null,
        manufacturer: manufacturer || null,
        warranty_expired: warranty_expired || null,
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
      .populate('building_id', 'building_name')
      .populate('floor_id', 'floor_name floor_number')
      .populate('building_tenant_id', 'tenant_name');

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
router.post('/', async (req, res) => {
  try {
    const asset = new Asset(req.body);
    await asset.save();

    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      data: asset
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating asset',
      error: error.message
    });
  }
});

// PUT /api/assets/:id - Update asset
router.put('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

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
    res.status(400).json({
      success: false,
      message: 'Error updating asset',
      error: error.message
    });
  }
});


// GET /api/assets/summary/stats - Get asset summary statistics
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);

    const stats = await Asset.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: 1 },
          operational: {
            $sum: { $cond: [{ $eq: ['$status', 'Operational'] }, 1, 0] }
          },
          warrantyExpiring: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$warranty_expiry', null] },
                    { $lte: ['$warranty_expiry', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] },
                    { $gte: ['$warranty_expiry', new Date()] }
                  ]
                },
                1,
                0
              ]
            }
          },
          needsMaintenance: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$status', 'Maintenance Required'] },
                    { $eq: ['$condition', 'Fair'] }
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

    const result = stats[0] || {
      totalAssets: 0,
      operational: 0,
      warrantyExpiring: 0,
      needsMaintenance: 0
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