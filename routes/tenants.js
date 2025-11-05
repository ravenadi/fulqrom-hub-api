const express = require('express');
const mongoose = require('mongoose');
const BuildingTenant = require('../models/BuildingTenant');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');
const { logUpdate, logDelete } = require('../utils/auditLogger');

const router = express.Router();

// Helper functions
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidTimeFormat = (time) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

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
  const tenant_data = req.body;

  // ABN Validation
  if (tenant_data.abn) {
    if (!/^\d{11}$/.test(tenant_data.abn)) {
      errors.push('ABN must be exactly 11 digits');
    }
  }

  // Emergency Contact Validation
  if (tenant_data.emergency_contacts && Array.isArray(tenant_data.emergency_contacts)) {
    tenant_data.emergency_contacts.forEach((contact, index) => {
      if (!contact.name) {
        errors.push(`Emergency contact ${index + 1}: Name is required`);
      }
      if (!contact.phone) {
        errors.push(`Emergency contact ${index + 1}: Phone is required`);
      }
      if (contact.email && !isValidEmail(contact.email)) {
        errors.push(`Emergency contact ${index + 1}: Email is invalid`);
      }
    });
  }

  // Employee Count Validation
  if (tenant_data.employee_count !== undefined && tenant_data.employee_count < 0) {
    errors.push('Employee count must be 0 or greater');
  }

  // Parking Allocation Validation
  if (tenant_data.parking_allocation !== undefined && tenant_data.parking_allocation < 0) {
    errors.push('Parking allocation must be 0 or greater');
  }

  // Business Hours Validation
  if (tenant_data.business_hours) {
    if (tenant_data.business_hours.start && !isValidTimeFormat(tenant_data.business_hours.start)) {
      errors.push('Business hours start time is invalid');
    }
    if (tenant_data.business_hours.end && !isValidTimeFormat(tenant_data.business_hours.end)) {
      errors.push('Business hours end time is invalid');
    }
  }

  // Special Requirements Validation
  const validRequirements = ['24_7_access', 'high_security', 'loading_dock', 'after_hours_hvac', 'dedicated_parking', 'signage_rights', 'kitchen_facilities', 'server_room'];
  if (tenant_data.special_requirements) {
    if (!Array.isArray(tenant_data.special_requirements)) {
      errors.push('Special requirements must be an array');
    } else {
      const invalidReqs = tenant_data.special_requirements.filter(req => !validRequirements.includes(req));
      if (invalidReqs.length > 0) {
        errors.push(`Invalid special requirements: ${invalidReqs.join(', ')}`);
      }
    }
  }

  // Contacts Validation
  if (tenant_data.contacts && Array.isArray(tenant_data.contacts)) {
    tenant_data.contacts.forEach((contact, index) => {
      if (!contact.name) {
        errors.push(`Contact ${index + 1}: Name is required`);
      }
      if (contact.email && !isValidEmail(contact.email)) {
        errors.push(`Contact ${index + 1}: Email is invalid`);
      }
    });

    // Ensure only one primary contact
    const primaryCount = tenant_data.contacts.filter(c => c.is_primary).length;
    if (primaryCount > 1) {
      errors.push('Only one contact can be marked as primary');
    }
  }

  // Legacy email validation
  if (tenant_data.primary_contact_email && !isValidEmail(tenant_data.primary_contact_email)) {
    errors.push('Invalid primary contact email format');
  }

  // Required fields validation
  if (req.method === 'POST') {
    const requiredFields = ['tenant_legal_name', 'building_id', 'customer_id'];
    requiredFields.forEach(field => {
      if (!tenant_data[field]) {
        errors.push(`${field.replace('_', ' ')} is required`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
  }

  next();
};

// GET /api/tenants - List all tenants
router.get('/', checkModulePermission('tenants', 'view'), async (req, res) => {
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
    let filterQuery = {
      is_delete: { $ne: true }  // Exclude soft-deleted records
    };

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

    const tenants = await BuildingTenant.find(filterQuery)
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
router.get('/:id', checkResourcePermission('tenant', 'view', (req) => req.params.id), async (req, res) => {
  try {
    const tenant = await BuildingTenant.findOne({
      _id: req.params.id,
      is_delete: { $ne: true }  // Exclude soft-deleted records
    })
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
router.post('/', checkModulePermission('tenants', 'create'), validateTenantData, async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to create building tenant'
      });
    }

    // Create building tenant with tenant_id from authenticated user
    const tenantData = {
      ...req.body,
      tenant_id: tenantId
    };

    const tenant = new BuildingTenant(tenantData);
    tenant.$setAuditContext(req, 'create');
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
router.put('/:id', checkResourcePermission('tenant', 'edit', (req) => req.params.id), requireIfMatch, validateTenantData, async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update building tenant'
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

    // Load tenant document (tenant-scoped automatically via plugin)
    const tenant = await BuildingTenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Building tenant not found or you do not have permission to update it'
      });
    }

    // Verify tenant ownership
    if (tenant.tenant_id && tenant.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Building tenant belongs to a different tenant'
      });
    }

    // Check version match for optimistic concurrency control
    if (tenant.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: tenant.__v,
        resource: 'BuildingTenant',
        id: req.params.id
      });
    }

    // Prevent updating tenant_id
    const updateData = { ...req.body };
    delete updateData.tenant_id;

    // Build atomic update object - filter out undefined/null to preserve existing data
    const allowedFields = ['tenant_name', 'customer_id', 'site_id', 'building_id', 'floor_id',
      'unit_number', 'lease_start', 'lease_end', 'lease_status', 'status', 'is_active',
      'contact_info', 'notes', 'rent_amount', 'deposit_amount'];
    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });
    
    // Add updated_at
    atomicUpdate.updated_at = new Date().toISOString();

    // Perform atomic update with version check (prevents lost updates)
    const result = await BuildingTenant.findOneAndUpdate(
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
    
    if (!result) {
      // Version conflict - resource was modified
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: tenant.__v,
        resource: 'BuildingTenant',
        id: req.params.id
      });
    }

    // Log audit for tenant update (manual logging since findOneAndUpdate bypasses hooks)
    const tenantName = result.tenant_trading_name || result.tenant_legal_name || 'Building Tenant';
    logUpdate({ module: 'tenant', resourceName: tenantName, req, moduleId: result._id, resource: result.toObject() });

    // Populate tenant before returning
    await result.populate('customer_id', 'organisation.organisation_name');
    await result.populate('site_id', 'site_name address');
    await result.populate('building_id', 'building_name building_code');
    await result.populate('floor_id', 'floor_name floor_number');

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: result
    });
  } catch (error) {
    // Handle Mongoose VersionError (shouldn't happen with manual check above, but safety net)
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'BuildingTenant',
        id: req.params.id
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating tenant',
      error: error.message
    });
  }
});

// GET /api/tenants/by-building/:buildingId - Get tenants by building
router.get('/by-building/:buildingId', checkModulePermission('tenants', 'view'), async (req, res) => {
  try {
    const tenants = await BuildingTenant.find({ building_id: req.params.buildingId })
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
router.get('/summary/stats', checkModulePermission('tenants', 'view'), async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = new mongoose.Types.ObjectId(building_id);

    const stats = await BuildingTenant.aggregate([
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
router.delete('/:id', checkResourcePermission('tenant', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete building tenant'
      });
    }

    // Find tenant first to set audit context before delete
    const tenant = await BuildingTenant.findOne({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this resource
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Building tenant not found or you do not have permission to delete it'
      });
    }

    // Check if already deleted
    if (tenant.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Building tenant already deleted'
      });
    }

    // Soft delete building tenant (no cascade needed)
    await BuildingTenant.findByIdAndUpdate(req.params.id, { is_delete: true });

    // Log audit for tenant deletion
    const tenantName = tenant.tenant_trading_name || tenant.tenant_legal_name || 'Building Tenant';
    logDelete({ module: 'building_tenant', resourceName: tenantName, req, moduleId: tenant._id, resource: tenant.toObject() });

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
router.get('/by-industry', checkModulePermission('tenants', 'view'), async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery.customer_id = new mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = new mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = new mongoose.Types.ObjectId(building_id);

    const industryStats = await BuildingTenant.aggregate([
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