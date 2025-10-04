const express = require('express');
const mongoose = require('mongoose');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');

const router = express.Router();

// GET /api/buildings - List all buildings with pagination and search
router.get('/', async (req, res) => {
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
      sort_by = 'createdAt',
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

    // Filter by customer
    if (customer_id) {
      if (mongoose.Types.ObjectId.isValid(customer_id)) {
        filterQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
      } else {
        filterQuery.customer_id = customer_id;
      }
    }

    // Filter by site
    if (site_id) {
      const siteIds = site_id.split(',').map(id => id.trim());
      filterQuery.site_id = { $in: siteIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) };
    }

    // Filter by building type
    if (building_type) {
      filterQuery.building_type = building_type;
    }

    // Filter by status (support both operational_status and status)
    const statusFilter = operational_status || status;
    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim());
      filterQuery.status = { $in: statuses };
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
          from: 'tenants',
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
    console.error('Error fetching buildings:', error);
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