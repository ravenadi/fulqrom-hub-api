const express = require('express');
const mongoose = require('mongoose');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');

const router = express.Router();

// GET /api/sites - List all sites with filters, pagination, and sorting
router.get('/', checkModulePermission('sites', 'view'), async (req, res) => {
  try {
    const {
      customer_id,
      status,
      site_type,
      state,
      search,
      is_active,
      page = 1,
      limit = 20,
      sort_by = 'created_date',
      sort_order = 'desc'
    } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      // Support multi-select with comma-separated values
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;

      if (Array.isArray(customerIds)) {
        filterQuery.customer_id = {
          $in: customerIds.map(id =>
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          )
        };
      } else if (mongoose.Types.ObjectId.isValid(customerIds)) {
        filterQuery.customer_id = new mongoose.Types.ObjectId(customerIds);
      } else {
        filterQuery.customer_id = customerIds;
      }
    }

    if (status) {
      // Support multi-select with comma-separated values
      const statuses = status.includes(',')
        ? status.split(',').map(s => s.trim())
        : status;
      filterQuery.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }

    if (site_type) {
      // Support multi-select with comma-separated values
      const types = site_type.includes(',')
        ? site_type.split(',').map(t => t.trim())
        : site_type;
      filterQuery.type = Array.isArray(types) ? { $in: types } : types;
    }

    if (state) {
      // Support multi-select with comma-separated values
      const states = state.includes(',')
        ? state.split(',').map(s => s.trim())
        : state;
      filterQuery['address.state'] = Array.isArray(states) ? { $in: states } : states;
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Search across key fields
    if (search) {
      filterQuery.$or = [
        { site_name: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } },
        { 'address.suburb': { $regex: search, $options: 'i' } },
        { 'address.full_address': { $regex: search, $options: 'i' } },
        { 'manager.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200); // Max 200 per page
    const skip = (pageNumber - 1) * limitNumber;

    // Sort configuration
    const sortField = [
      'created_date', 'createdAt', 'updatedAt', 'site_name',
      'status', 'type', 'total_floor_area'
    ].includes(sort_by) ? sort_by : 'created_date';
    const sortDirection = sort_order === 'asc' ? 1 : -1;

    // Get total count for pagination
    const totalSites = await Site.countDocuments(filterQuery);

    // Use aggregation pipeline to include related counts
    const sitesAggregation = await Site.aggregate([
      { $match: filterQuery },
      { $sort: { [sortField]: sortDirection } },
      { $skip: skip },
      { $limit: limitNumber },
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
      // Lookup buildings count
      {
        $lookup: {
          from: 'buildings',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'buildings_data'
        }
      },
      // Lookup floors count (sum from all buildings)
      {
        $lookup: {
          from: 'buildings',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $group: { _id: null, total: { $sum: '$number_of_floors' } } }
          ],
          as: 'floors_data'
        }
      },
      // Lookup tenants count
      {
        $lookup: {
          from: 'building_tenants',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'tenants_data'
        }
      },
      // Lookup assets count
      {
        $lookup: {
          from: 'assets',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'assets_data'
        }
      },
      // Format the output
      {
        $addFields: {
          id: { $toString: '$_id' },
          customer_id: {
            _id: { $toString: '$customer_data._id' },
            id: { $toString: '$customer_data._id' },
            organisation: '$customer_data.organisation',
            display_name: {
              $ifNull: ['$customer_data.organisation.organisation_name', 'Unknown Organisation']
            }
          },
          buildings_count: {
            $ifNull: [{ $arrayElemAt: ['$buildings_data.count', 0] }, 0]
          },
          floors_count: {
            $ifNull: [{ $arrayElemAt: ['$floors_data.total', 0] }, 0]
          },
          tenants_count: {
            $ifNull: [{ $arrayElemAt: ['$tenants_data.count', 0] }, 0]
          },
          assets_count: {
            $ifNull: [{ $arrayElemAt: ['$assets_data.count', 0] }, 0]
          },
          // Apply defaults for new fields if missing
          land_area: { $ifNull: ['$land_area', 0] },
          land_area_unit: { $ifNull: ['$land_area_unit', 'm²'] },
          shared_facilities: { $ifNull: ['$shared_facilities', []] },
          note: { $ifNull: ['$note', ''] },
          local_council: { $ifNull: ['$local_council', ''] },
          security_level: { $ifNull: ['$security_level', ''] },
          display_address: {
            $cond: {
              if: { $eq: [{ $type: '$address' }, 'string'] },
              then: '$address',
              else: {
                $cond: {
                  if: '$address.full_address',
                  then: '$address.full_address',
                  else: {
                    $concat: [
                      { $ifNull: ['$address.street', ''] },
                      { $cond: [{ $and: ['$address.street', '$address.suburb'] }, ', ', ''] },
                      { $ifNull: ['$address.suburb', ''] },
                      { $cond: [{ $and: ['$address.suburb', '$address.state'] }, ', ', ''] },
                      { $ifNull: ['$address.state', ''] },
                      { $cond: [{ $and: ['$address.state', '$address.postcode'] }, ' ', ''] },
                      { $ifNull: ['$address.postcode', ''] }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      // Remove temporary lookup fields
      {
        $project: {
          customer_data: 0,
          buildings_data: 0,
          floors_data: 0,
          tenants_data: 0,
          assets_data: 0
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: sitesAggregation,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: totalSites,
        total_pages: Math.ceil(totalSites / limitNumber)
      }
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching sites',
      error: error.message
    });
  }
});

// GET /api/sites/:id - Get single site with full details
router.get('/:id', checkResourcePermission('site', 'view', (req) => req.params.id), async (req, res) => {
  try {
    const siteId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(siteId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid site ID format'
      });
    }

    // Use aggregation to get site with all related counts
    const siteAggregation = await Site.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(siteId) } },
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
      // Lookup buildings count
      {
        $lookup: {
          from: 'buildings',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'buildings_data'
        }
      },
      // Lookup floors count
      {
        $lookup: {
          from: 'buildings',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $group: { _id: null, total: { $sum: '$number_of_floors' } } }
          ],
          as: 'floors_data'
        }
      },
      // Lookup tenants count
      {
        $lookup: {
          from: 'building_tenants',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'tenants_data'
        }
      },
      // Lookup assets count
      {
        $lookup: {
          from: 'assets',
          let: { siteId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$site_id', '$$siteId'] } } },
            { $count: 'count' }
          ],
          as: 'assets_data'
        }
      },
      // Format the output
      {
        $addFields: {
          id: { $toString: '$_id' },
          customer_id: {
            _id: { $toString: '$customer_data._id' },
            id: { $toString: '$customer_data._id' },
            organisation: '$customer_data.organisation',
            display_name: {
              $ifNull: ['$customer_data.organisation.organisation_name', 'Unknown Organisation']
            }
          },
          buildings_count: {
            $ifNull: [{ $arrayElemAt: ['$buildings_data.count', 0] }, 0]
          },
          floors_count: {
            $ifNull: [{ $arrayElemAt: ['$floors_data.total', 0] }, 0]
          },
          tenants_count: {
            $ifNull: [{ $arrayElemAt: ['$tenants_data.count', 0] }, 0]
          },
          assets_count: {
            $ifNull: [{ $arrayElemAt: ['$assets_data.count', 0] }, 0]
          },
          // Apply defaults for new fields if missing
          land_area: { $ifNull: ['$land_area', 0] },
          land_area_unit: { $ifNull: ['$land_area_unit', 'm²'] },
          shared_facilities: { $ifNull: ['$shared_facilities', []] },
          note: { $ifNull: ['$note', ''] },
          local_council: { $ifNull: ['$local_council', ''] },
          security_level: { $ifNull: ['$security_level', ''] },
          display_address: {
            $cond: {
              if: { $eq: [{ $type: '$address' }, 'string'] },
              then: '$address',
              else: {
                $cond: {
                  if: '$address.full_address',
                  then: '$address.full_address',
                  else: {
                    $concat: [
                      { $ifNull: ['$address.street', ''] },
                      { $cond: [{ $and: ['$address.street', '$address.suburb'] }, ', ', ''] },
                      { $ifNull: ['$address.suburb', ''] },
                      { $cond: [{ $and: ['$address.suburb', '$address.state'] }, ', ', ''] },
                      { $ifNull: ['$address.state', ''] },
                      { $cond: [{ $and: ['$address.state', '$address.postcode'] }, ' ', ''] },
                      { $ifNull: ['$address.postcode', ''] }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      // Remove temporary lookup fields
      {
        $project: {
          customer_data: 0,
          buildings_data: 0,
          floors_data: 0,
          tenants_data: 0,
          assets_data: 0
        }
      }
    ]);

    if (!siteAggregation || siteAggregation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    res.status(200).json({
      success: true,
      data: siteAggregation[0]
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching site',
      error: error.message
    });
  }
});

// POST /api/sites - Create new site
router.post('/', checkModulePermission('sites', 'create'), async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'customer_id is required'
      });
    }

    // Validate land_area if provided
    if (req.body.land_area !== undefined && req.body.land_area < 0) {
      return res.status(400).json({
        success: false,
        message: 'land_area must be greater than or equal to 0'
      });
    }

    const site = new Site(req.body);
    await site.save();

    // Fetch the created site with populated customer data
    const createdSite = await Site.findById(site._id)
      .populate('customer_id', 'organisation.organisation_name');

    res.status(201).json({
      success: true,
      message: 'Site created successfully',
      data: createdSite
    });
  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error creating site',
      error: error.message
    });
  }
});

// PUT /api/sites/:id - Update site
router.put('/:id', checkResourcePermission('site', 'edit', (req) => req.params.id), async (req, res) => {
  try {
    // Validate land_area if provided
    if (req.body.land_area !== undefined && req.body.land_area < 0) {
      return res.status(400).json({
        success: false,
        message: 'land_area must be greater than or equal to 0'
      });
    }

    const site = await Site.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('customer_id', 'organisation.organisation_name');

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Site updated successfully',
      data: site
    });
  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error updating site',
      error: error.message
    });
  }
});

// DELETE /api/sites/:id - Soft delete site
router.delete('/:id', checkResourcePermission('site', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    const site = await Site.findByIdAndUpdate(
      req.params.id,
      { is_active: false },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Site deleted successfully',
      data: site
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error deleting site',
      error: error.message
    });
  }
});

module.exports = router;
