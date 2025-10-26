const express = require('express');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');

const router = express.Router();

// GET /api/vendors - List all vendors with filters and pagination
router.get('/', checkModulePermission('vendors', 'view'), async (req, res) => {
  try {
    const {
      search,
      category,
      status,
      rating,
      state,
      compliance,
      is_active,
      page = 1,
      limit = 20,
      sort_by = 'name',
      sort_order = 'asc'
    } = req.query;

    // Get tenant ID from request context (mandatory for data isolation)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Build filter query with mandatory tenant filter
    let filterQuery = {
      tenant_id: tenantId
    };

    // Search across name, ABN, and email (case-insensitive)
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filterQuery.$or = [
        { name: searchRegex },
        { abn: searchRegex },
        { email: searchRegex },
        { 'address.suburb': searchRegex }
      ];
    }

    // Category filter - match both category and subcategories
    if (category) {
      filterQuery.$or = [
        { category: category },
        { subcategories: category }
      ];
    }

    // Status filter
    if (status) {
      filterQuery.status = status;
    }

    // State filter
    if (state) {
      filterQuery['address.state'] = state;
    }

    // Rating filter (minimum rating)
    if (rating) {
      filterQuery.rating = { $gte: parseFloat(rating) };
    }

    // Active status filter
    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    // Pagination
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200); // Max 200 per page
    const skip = (pageNumber - 1) * limitNumber;

    // Sort configuration
    const sortField = [
      'name', 'rating', 'createdAt', 'updatedAt', 'category',
      'status', 'totalJobs', 'onTimePercentage'
    ].includes(sort_by) ? sort_by : 'name';
    const sortDirection = sort_order === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalVendors = await Vendor.countDocuments(filterQuery);

    // Execute query with pagination and sorting
    let vendors = await Vendor.find(filterQuery)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Add compliance status to each vendor
    vendors = vendors.map(vendor => {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      // Check licenses
      const expiredLicenses = vendor.licenses?.filter(lic => new Date(lic.expiryDate) < today) || [];
      const expiringLicenses = vendor.licenses?.filter(lic => {
        const expiry = new Date(lic.expiryDate);
        return expiry >= today && expiry <= thirtyDaysFromNow;
      }) || [];

      // Check insurances
      const expiredInsurances = vendor.insurances?.filter(ins => new Date(ins.expiryDate) < today) || [];
      const expiringInsurances = vendor.insurances?.filter(ins => {
        const expiry = new Date(ins.expiryDate);
        return expiry >= today && expiry <= thirtyDaysFromNow;
      }) || [];

      const complianceStatus = {
        licenses: {
          total: vendor.licenses?.length || 0,
          expired: expiredLicenses.length,
          expiring: expiringLicenses.length,
          current: (vendor.licenses?.length || 0) - expiredLicenses.length - expiringLicenses.length
        },
        insurances: {
          total: vendor.insurances?.length || 0,
          expired: expiredInsurances.length,
          expiring: expiringInsurances.length,
          current: (vendor.insurances?.length || 0) - expiredInsurances.length - expiringInsurances.length
        },
        certifications: {
          total: vendor.certifications?.length || 0
        },
        overall_status: (expiredLicenses.length > 0 || expiredInsurances.length > 0) ? 'non-compliant' :
                        (expiringLicenses.length > 0 || expiringInsurances.length > 0) ? 'expiring-soon' : 'compliant'
      };

      return {
        ...vendor,
        compliance_status: complianceStatus,
        completion_rate: vendor.totalJobs > 0 ? Math.round((vendor.completedJobs / vendor.totalJobs) * 100) : 0,
        formatted_abn: vendor.abn ? vendor.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4') : ''
      };
    });

    // Filter by compliance if requested
    if (compliance) {
      vendors = vendors.filter(v => v.compliance_status.overall_status === compliance);
    }

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: totalVendors,
        total_pages: Math.ceil(totalVendors / limitNumber)
      },
      meta: {
        current_page: pageNumber,
        per_page: limitNumber,
        total: totalVendors,
        last_page: Math.ceil(totalVendors / limitNumber),
        from: skip + 1,
        to: Math.min(skip + limitNumber, totalVendors)
      }
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching vendors',
      error: error.message
    });
  }
});

// GET /api/vendors/stats - Get vendor statistics
router.get('/stats', checkModulePermission('vendors', 'view'), async (req, res) => {
  try {
    // Get tenant ID from request context (mandatory for data isolation)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Get vendors for this tenant only
    const allVendors = await Vendor.find({ tenant_id: tenantId }).lean();

    const totalVendors = allVendors.length;
    const activeVendors = allVendors.filter(v => v.status === 'active').length;

    // Calculate average rating
    const vendorsWithRating = allVendors.filter(v => v.rating > 0);
    const averageRating = vendorsWithRating.length > 0
      ? vendorsWithRating.reduce((sum, v) => sum + v.rating, 0) / vendorsWithRating.length
      : 0;

    // Calculate compliance rate
    let compliantCount = 0;
    let expiringLicensesCount = 0;
    let expiringInsurancesCount = 0;

    allVendors.forEach(vendor => {
      const expiredLicenses = vendor.licenses?.filter(lic => new Date(lic.expiryDate) < today) || [];
      const expiredInsurances = vendor.insurances?.filter(ins => new Date(ins.expiryDate) < today) || [];
      const expiringLicenses = vendor.licenses?.filter(lic => {
        const expiry = new Date(lic.expiryDate);
        return expiry >= today && expiry <= thirtyDaysFromNow;
      }) || [];
      const expiringInsurances = vendor.insurances?.filter(ins => {
        const expiry = new Date(ins.expiryDate);
        return expiry >= today && expiry <= thirtyDaysFromNow;
      }) || [];

      if (expiredLicenses.length === 0 && expiredInsurances.length === 0) {
        compliantCount++;
      }

      expiringLicensesCount += expiringLicenses.length;
      expiringInsurancesCount += expiringInsurances.length;
    });

    const complianceRate = totalVendors > 0 ? (compliantCount / totalVendors) * 100 : 0;

    // Category breakdown
    const categoryBreakdown = {};
    allVendors.forEach(vendor => {
      if (!categoryBreakdown[vendor.category]) {
        categoryBreakdown[vendor.category] = 0;
      }
      categoryBreakdown[vendor.category]++;
    });

    res.status(200).json({
      success: true,
      data: {
        totalVendors,
        activeVendors,
        averageRating: Math.round(averageRating * 10) / 10,
        complianceRate: Math.round(complianceRate * 10) / 10,
        expiringLicenses: expiringLicensesCount,
        expiringInsurances: expiringInsurancesCount,
        categoryBreakdown
      }
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching vendor statistics',
      error: error.message
    });
  }
});

// GET /api/vendors/:id - Get single vendor by ID
router.get('/:id', checkResourcePermission('vendor', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to view vendor'
      });
    }

    // Find vendor ONLY if it belongs to the user's tenant
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this vendor
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor',
      error: error.message
    });
  }
});

// POST /api/vendors - Create new vendor
router.post('/', checkModulePermission('vendors', 'create'), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to create vendor'
      });
    }

    const errors = [];

    // Validate required fields (updated for new schema)
    if (!req.body.contractor_name && !req.body.name) {
      errors.push('Contractor name is required');
    }

    if (!req.body.contractor_type && !req.body.category) {
      errors.push('Contractor type is required');
    }

    // Validate contacts array (at least one contact required)
    if (!req.body.contacts || !Array.isArray(req.body.contacts) || req.body.contacts.length === 0) {
      errors.push('At least one contact is required');
    } else {
      req.body.contacts.forEach((contact, index) => {
        if (!contact.name) errors.push(`Contact ${index + 1}: Name is required`);
        if (!contact.phone) errors.push(`Contact ${index + 1}: Phone is required`);
        if (!contact.email) errors.push(`Contact ${index + 1}: Email is required`);
      });

      // Ensure only one primary contact
      const primaryCount = req.body.contacts.filter(c => c.is_primary).length;
      if (primaryCount > 1) {
        errors.push('Only one contact can be marked as primary');
      }
    }

    // Building Consultant validation
    if (req.body.contractor_type === 'Building Consultant') {
      if (!req.body.consultant_specialisation) {
        errors.push('Consultant specialisation is required for Building Consultant');
      }
      if (!req.body.building_consultant_id) {
        errors.push('Building consultant ID is required for Building Consultant');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check for duplicate ABN within this tenant if provided
    if (req.body.abn) {
      const existingVendor = await Vendor.findOne({
        abn: req.body.abn.replace(/\s/g, ''),
        tenant_id: tenantId
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: 'A vendor with this ABN already exists in your organization',
          field: 'abn'
        });
      }
    }

    // Create vendor with tenant_id from authenticated user
    const vendorData = {
      ...req.body,
      tenant_id: tenantId
    };

    const vendor = new Vendor(vendorData);
    await vendor.save();

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: vendor
    });
  } catch (error) {

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error creating vendor',
      error: error.message
    });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', checkResourcePermission('vendor', 'edit', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update vendor'
      });
    }

    // If ABN is being updated, check for duplicates within this tenant
    if (req.body.abn) {
      const cleanedABN = req.body.abn.replace(/\s/g, '');
      const existingVendor = await Vendor.findOne({
        abn: cleanedABN,
        tenant_id: tenantId,
        _id: { $ne: req.params.id }
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: 'A vendor with this ABN already exists in your organization',
          field: 'abn'
        });
      }
    }

    // Update vendor ONLY if it belongs to the user's tenant
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, tenant_id: tenantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found or you do not have permission to update it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data: vendor
    });
  } catch (error) {

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating vendor',
      error: error.message
    });
  }
});

// DELETE /api/vendors/:id - Delete vendor
router.delete('/:id', checkResourcePermission('vendor', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    const vendorId = req.params.id;

    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete vendor'
      });
    }

    // Delete vendor ONLY if it belongs to the user's tenant
    const vendor = await Vendor.findOneAndDelete({
      _id: vendorId,
      tenant_id: tenantId  // Ensure user owns this vendor
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error deleting vendor',
      error: error.message
    });
  }
});

// PATCH /api/vendors/:id/status - Update vendor status
router.patch('/:id/status', checkResourcePermission('vendor', 'edit', (req) => req.params.id), async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { status } = req.body;

    // Get tenant ID from request context (mandatory for data isolation)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID format'
      });
    }

    // Validate status
    const validStatuses = ['active', 'inactive', 'suspended', 'pending-approval', 'under-review'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
        validStatuses
      });
    }

    // Update vendor status within tenant scope only
    const vendor = await Vendor.findOneAndUpdate(
      { _id: vendorId, tenant_id: tenantId },
      { status },
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor status updated successfully',
      data: vendor
    });
  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error updating vendor status',
      error: error.message
    });
  }
});

module.exports = router;
