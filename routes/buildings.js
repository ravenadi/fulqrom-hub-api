const express = require('express');
const Building = require('../models/Building');

const router = express.Router();

// GET /api/buildings - List all buildings
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      category,
      building_type,
      building_grade,
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

    if (category) {
      filterQuery.category = category;
    }

    if (building_type) {
      filterQuery.building_type = building_type;
    }

    if (building_grade) {
      filterQuery.building_grade = building_grade;
    }

    if (status) {
      filterQuery.status = status;
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    const buildings = await Building.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name address')
      .populate('building_manager_id', 'name email')
      .sort({ createdAt: -1 });

    // Calculate summary statistics
    const totalBuildings = buildings.length;
    const activeBuildings = buildings.filter(building => building.status === 'Active').length;
    const underConstruction = buildings.filter(building => building.status === 'Under Construction').length;
    const totalFloors = buildings.reduce((sum, building) => sum + (building.total_floors || 0), 0);
    const totalAssets = buildings.reduce((sum, building) => sum + (building.total_assets || 0), 0);
    const avgOccupancy = buildings.length > 0 ?
      buildings.reduce((sum, building) => sum + (building.avg_occupancy || 0), 0) / buildings.length : 0;

    res.status(200).json({
      success: true,
      count: totalBuildings,
      summary: {
        total_buildings: totalBuildings,
        active_buildings: activeBuildings,
        under_construction: underConstruction,
        total_floors: totalFloors,
        total_assets: totalAssets,
        avg_occupancy: Math.round(avgOccupancy)
      },
      data: buildings
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
router.get('/:id', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id)
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address status')
      .populate('building_manager_id', 'name email phone title');

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    res.status(200).json({
      success: true,
      data: building
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
router.post('/', async (req, res) => {
  try {
    const building = new Building(req.body);
    await building.save();

    // Populate the created building before returning
    await building.populate('customer_id', 'organisation.organisation_name');
    await building.populate('site_id', 'site_name address');
    await building.populate('building_manager_id', 'name email');

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

// GET /api/buildings/summary/stats - Get building summary statistics
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);

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
router.get('/by-category', async (req, res) => {
  try {
    const { customer_id, site_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);

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