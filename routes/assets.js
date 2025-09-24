const express = require('express');
const Asset = require('../models/Asset');

const router = express.Router();

// GET /api/assets - List all assets
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      category,
      status,
      condition,
      manufacturer,
      warranty_expired,
      is_active
    } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      filterQuery.customer_id = customer_id;
    }

    if (site_id) {
      filterQuery.site_id = site_id;
    }

    if (building_id) {
      filterQuery.building_id = building_id;
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
      filterQuery.manufacturer = new RegExp(manufacturer, 'i');
    }

    if (warranty_expired === 'true') {
      filterQuery.warranty_expiry = { $lt: new Date() };
    } else if (warranty_expired === 'false') {
      filterQuery.warranty_expiry = { $gte: new Date() };
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    const assets = await Asset.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .populate('building_id', 'building_name')
      .sort({ createdAt: -1 });

    // Calculate summary statistics
    const totalAssets = assets.length;
    const operationalAssets = assets.filter(asset => asset.status === 'Operational').length;
    const warrantyExpiringAssets = assets.filter(asset => {
      if (!asset.warranty_expiry) return false;
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
      return asset.warranty_expiry <= thirtyDaysFromNow && asset.warranty_expiry >= today;
    }).length;
    const maintenanceRequiredAssets = assets.filter(asset =>
      asset.status === 'Maintenance Required' || asset.condition === 'Fair'
    ).length;

    res.status(200).json({
      success: true,
      count: totalAssets,
      summary: {
        total_assets: totalAssets,
        operational: operationalAssets,
        warranty_expiring: warrantyExpiringAssets,
        needs_maintenance: maintenanceRequiredAssets
      },
      data: assets
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