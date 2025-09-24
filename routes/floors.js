const express = require('express');
const Floor = require('../models/Floor');

const router = express.Router();

// GET /api/floors - List all floors
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_type,
      occupancy_type,
      access_control,
      status,
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

    if (floor_type) {
      filterQuery.floor_type = floor_type;
    }

    if (occupancy_type) {
      filterQuery.occupancy_type = occupancy_type;
    }

    if (access_control) {
      filterQuery.access_control = access_control;
    }

    if (status) {
      filterQuery.status = status;
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    const floors = await Floor.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name address')
      .populate('building_id', 'building_name building_code')
      .sort({ building_id: 1, floor_number: 1 });

    // Calculate summary statistics
    const totalFloors = floors.length;
    const activeFloors = floors.filter(floor => floor.status === 'Active').length;
    const underConstruction = floors.filter(floor => floor.status === 'Under Construction').length;
    const totalAssets = floors.reduce((sum, floor) => sum + (floor.assets_count || 0), 0);
    const totalArea = floors.reduce((sum, floor) => sum + (floor.floor_area || 0), 0);
    const avgOccupancy = floors.length > 0 ?
      floors.reduce((sum, floor) => sum + (floor.occupancy_percentage || 0), 0) / floors.length : 0;

    res.status(200).json({
      success: true,
      count: totalFloors,
      summary: {
        total_floors: totalFloors,
        active_floors: activeFloors,
        under_construction: underConstruction,
        total_assets: totalAssets,
        total_area: Math.round(totalArea),
        avg_occupancy: Math.round(avgOccupancy)
      },
      data: floors
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
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
  try {
    const floor = new Floor(req.body);
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
router.put('/:id', async (req, res) => {
  try {
    const floor = await Floor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!floor) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found'
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
        Math.round(floors.reduce((sum, f) => sum + (f.occupancy_percentage || 0), 0) / floors.length) : 0
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
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

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
          avgOccupancy: { $avg: '$occupancy_percentage' },
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
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

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
          avgOccupancy: { $avg: '$occupancy_percentage' },
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