const express = require('express');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

const router = express.Router();

// Australian validation helpers
const validateABN = (abn) => {
  if (!abn) return true; // Optional field
  const abnString = abn.replace(/\s/g, '');
  return /^\d{11}$/.test(abnString);
};


const validatePostcode = (postcode) => {
  if (!postcode) return true; // Optional field
  return /^\d{4}$/.test(postcode);
};

// Validation middleware
const validateTenantData = (req, res, next) => {
  const errors = [];
  const { abn, primary_contact_email } = req.body;

  // ABN validation (11 digits)
  if (abn && !validateABN(abn)) {
    errors.push({
      field: 'abn',
      message: 'ABN must be exactly 11 digits'
    });
  }

  // Email validation
  if (primary_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary_contact_email)) {
    errors.push({
      field: 'primary_contact_email',
      message: 'Invalid email format'
    });
  }

  // Required fields validation
  if (req.method === 'POST') {
    const requiredFields = ['tenant_legal_name', 'building_id', 'customer_id'];
    requiredFields.forEach(field => {
      if (!req.body[field]) {
        errors.push({
          field: field,
          message: `${field.replace('_', ' ')} is required`
        });
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors
    });
  }

  next();
};

// GET /api/tenants/dropdown - Lightweight dropdown data
router.get('/dropdown', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      tenant_status,
      is_active = 'true'
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

    if (floor_id) {
      filterQuery.floor_id = floor_id;
    }

    if (tenant_status) {
      filterQuery.tenant_status = tenant_status;
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Fetch only id and tenant_name fields for dropdown
    const tenants = await Tenant.find(filterQuery)
      .select('_id tenant_legal_name tenant_trading_name')
      .sort({ tenant_legal_name: 1 })
      .lean(); // Use lean() for better performance

    // Transform to simple dropdown format
    const dropdownData = tenants.map(tenant => ({
      id: tenant._id.toString(),
      tenant_name: tenant.tenant_trading_name || tenant.tenant_legal_name || 'Unnamed Tenant'
    }));

    res.status(200).json({
      success: true,
      count: dropdownData.length,
      data: dropdownData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants dropdown data',
      error: error.message
    });
  }
});

// GET /api/tenants - List all tenants
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      tenant_status,
      lease_type,
      industry_type,
      lease_expiring_soon,
      is_active,
      search
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

    if (floor_id) {
      filterQuery.floor_id = floor_id;
    }

    if (tenant_status) {
      filterQuery.tenant_status = tenant_status;
    }

    if (lease_type) {
      filterQuery.lease_type = lease_type;
    }

    if (industry_type) {
      filterQuery.industry_type = industry_type;
    }

    if (lease_expiring_soon === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      filterQuery.lease_end_date = { $lte: thirtyDaysFromNow, $gte: new Date() };
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Simple search across key fields
    if (search) {
      filterQuery.$or = [
        { tenant_legal_name: { $regex: search, $options: 'i' } },
        { tenant_trading_name: { $regex: search, $options: 'i' } },
        { abn: { $regex: search, $options: 'i' } },
        { primary_contact_name: { $regex: search, $options: 'i' } },
        { primary_contact_email: { $regex: search, $options: 'i' } },
        { industry_type: { $regex: search, $options: 'i' } }
      ];
    }

    const tenants = await Tenant.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name address')
      .populate('building_id', 'building_name building_code')
      .populate('floor_id', 'floor_name floor_number')
      .sort({ tenant_legal_name: 1 });

    // Calculate summary statistics
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter(tenant => tenant.tenant_status === 'Active').length;
    const leasesExpiringSoon = tenants.filter(tenant => {
      if (!tenant.lease_end_date) return false;
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
      return tenant.lease_end_date <= thirtyDaysFromNow && tenant.lease_end_date >= today;
    }).length;
    const totalOccupiedArea = tenants.reduce((sum, tenant) => sum + (tenant.occupied_area || 0), 0);
    const totalEmployees = tenants.reduce((sum, tenant) => sum + (tenant.number_of_employees || 0), 0);
    const totalParkingSpaces = tenants.reduce((sum, tenant) => sum + (tenant.allocated_parking_spaces || 0), 0);

    res.status(200).json({
      success: true,
      count: totalTenants,
      summary: {
        total_tenants: totalTenants,
        active_tenants: activeTenants,
        leases_expiring_soon: leasesExpiringSoon,
        total_occupied_area: Math.round(totalOccupiedArea),
        total_employees: totalEmployees,
        total_parking_spaces: totalParkingSpaces
      },
      data: tenants
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants',
      error: error.message
    });
  }
});

// GET /api/tenants/:id - Get single tenant
router.get('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address status')
      .populate('building_id', 'building_name building_code category')
      .populate('floor_id', 'floor_name floor_number floor_type');

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant',
      error: error.message
    });
  }
});

// POST /api/tenants - Create new tenant
router.post('/', validateTenantData, async (req, res) => {
  try {
    const tenant = new Tenant(req.body);
    await tenant.save();

    // Populate the created tenant before returning
    await tenant.populate('customer_id', 'organisation.organisation_name');
    await tenant.populate('site_id', 'site_name address');
    await tenant.populate('building_id', 'building_name building_code');
    await tenant.populate('floor_id', 'floor_name floor_number');

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: tenant
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating tenant',
      error: error.message
    });
  }
});

// PUT /api/tenants/:id - Update tenant
router.put('/:id', validateTenantData, async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: tenant
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating tenant',
      error: error.message
    });
  }
});

// GET /api/tenants/by-building/:buildingId - Get tenants by building
router.get('/by-building/:buildingId', async (req, res) => {
  try {
    const tenants = await Tenant.find({ building_id: req.params.buildingId })
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .populate('floor_id', 'floor_name floor_number')
      .sort({ floor_id: 1, tenant_legal_name: 1 });

    const summary = {
      total_tenants: tenants.length,
      active_tenants: tenants.filter(t => t.tenant_status === 'Active').length,
      total_occupied_area: tenants.reduce((sum, t) => sum + (t.occupied_area || 0), 0),
      total_employees: tenants.reduce((sum, t) => sum + (t.number_of_employees || 0), 0),
      total_parking_spaces: tenants.reduce((sum, t) => sum + (t.allocated_parking_spaces || 0), 0)
    };

    res.status(200).json({
      success: true,
      count: tenants.length,
      summary,
      data: tenants
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants by building',
      error: error.message
    });
  }
});

// GET /api/tenants/summary/stats - Get tenant summary statistics
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

    const stats = await Tenant.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalTenants: { $sum: 1 },
          activeTenants: {
            $sum: { $cond: [{ $eq: ['$tenant_status', 'Active'] }, 1, 0] }
          },
          leasesExpiringSoon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$lease_end_date', null] },
                    { $lte: ['$lease_end_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] },
                    { $gte: ['$lease_end_date', new Date()] }
                  ]
                },
                1,
                0
              ]
            }
          },
          totalOccupiedArea: { $sum: '$occupied_area' },
          totalEmployees: { $sum: '$number_of_employees' },
          totalParkingSpaces: { $sum: '$allocated_parking_spaces' },
          avgRentalRate: { $avg: '$rental_rate' }
        }
      }
    ]);

    const result = stats[0] || {
      totalTenants: 0,
      activeTenants: 0,
      leasesExpiringSoon: 0,
      totalOccupiedArea: 0,
      totalEmployees: 0,
      totalParkingSpaces: 0,
      avgRentalRate: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant statistics',
      error: error.message
    });
  }
});

// DELETE /api/tenants/:id - Delete tenant
router.delete('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndDelete(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tenant deleted successfully',
      data: tenant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting tenant',
      error: error.message
    });
  }
});

// GET /api/tenants/by-industry - Group tenants by industry type
router.get('/by-industry', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

    const industryStats = await Tenant.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$industry_type',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$tenant_status', 'Active'] }, 1, 0] }
          },
          totalOccupiedArea: { $sum: '$occupied_area' },
          totalEmployees: { $sum: '$number_of_employees' },
          avgRentalRate: { $avg: '$rental_rate' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: industryStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching industry statistics',
      error: error.message
    });
  }
});

module.exports = router;