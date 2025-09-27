const express = require('express');
const Building = require('../models/Building');

const router = express.Router();

// GET /api/buildings - List all buildings with pagination and search
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 10,
      search,
      site_id,
      building_type,
      operational_status,
      sort_by = 'created_date',
      sort_order = 'desc',
      is_active
    } = req.query;

    // Build filter query
    let filterQuery = {};

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { building_name: new RegExp(search, 'i') },
        { building_code: new RegExp(search, 'i') },
        { site_name: new RegExp(search, 'i') }
      ];
    }

    // Filter by site
    if (site_id) {
      const siteIds = site_id.split(',').map(id => id.trim());
      filterQuery.site_id = { $in: siteIds };
    }

    // Filter by building type
    if (building_type) {
      filterQuery.building_type = building_type;
    }

    // Filter by status
    if (operational_status) {
      const statuses = operational_status.split(',').map(status => status.trim());
      filterQuery.status = { $in: statuses };
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const limit = parseInt(per_page);
    const skip = (parseInt(page) - 1) * limit;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sort_by] = sort_order === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalCount = await Building.countDocuments(filterQuery);

    // Fetch buildings with pagination
    const buildings = await Building.find(filterQuery)
      .populate('site_id', 'site_name address')
      .populate('customer_id', 'organisation.organisation_name')
      .sort(sortConfig)
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = parseInt(page);

    res.status(200).json({
      success: true,
      data: buildings,
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
      .populate('site_id', 'site_name address status');

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
    await building.populate('site_id', 'site_name address');
    await building.populate('customer_id', 'organisation.organisation_name');

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
router.put('/:id', async (req, res) => {
  try {
    const building = await Building.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('site_id', 'site_name address')
    .populate('customer_id', 'organisation.organisation_name');

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Building updated successfully',
      data: building
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
router.delete('/:id', async (req, res) => {
  try {
    const building = await Building.findByIdAndDelete(req.params.id);

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found'
      });
    }

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

// GET /api/buildings/options/dropdown - Get dropdown options
router.get('/options/dropdown', async (req, res) => {
  try {
    const options = {
      building_types: ['Office', 'Retail', 'Industrial', 'Mixed Use', 'Warehouse', 'Data Centre', 'Healthcare', 'Educational'],
      statuses: ['Active', 'Under Construction', 'Renovation', 'Vacant', 'Demolished']
    };

    res.status(200).json({
      success: true,
      data: options
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dropdown options',
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