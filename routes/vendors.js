const express = require('express');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');

const router = express.Router();

// GET /api/vendors - List all vendors with filters and pagination
router.get('/', async (req, res) => {
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

    // Build filter query
    let filterQuery = {};

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
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Get all vendors
    const allVendors = await Vendor.find({}).lean();

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
router.get('/:id', async (req, res) => {
  try {
    const vendorId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID format'
      });
    }

    const vendor = await Vendor.findById(vendorId);

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
router.post('/', async (req, res) => {
  try {
    const errors = [];

    // Validate required fields (updated for new schema)
    if (!req.body.contractor_name && !req.body.name) {
      errors.push('Contractor name is required');
    }

    if (!req.body.contractor_type && !req.body.category) {
      errors.push('Contractor type is required');
    }

    if (!req.body.address) {
      errors.push('Address is required');
    }

    if (!req.body.businessType) {
      errors.push('Business type is required');
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

    // Check for duplicate ABN if provided
    if (req.body.abn) {
      const existingVendor = await Vendor.findOne({
        abn: req.body.abn.replace(/\s/g, '')
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: 'A vendor with this ABN already exists',
          field: 'abn'
        });
      }
    }

    // Create new vendor
    const vendor = new Vendor(req.body);
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
router.put('/:id', async (req, res) => {
  try {
    const vendorId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID format'
      });
    }

    // If ABN is being updated, check for duplicates
    if (req.body.abn) {
      const cleanedABN = req.body.abn.replace(/\s/g, '');
      const existingVendor = await Vendor.findOne({
        abn: cleanedABN,
        _id: { $ne: vendorId }
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: 'A vendor with this ABN already exists',
          field: 'abn'
        });
      }
    }

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
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

// DELETE /api/vendors/:id - Soft delete vendor
router.delete('/:id', async (req, res) => {
  try {
    const vendorId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID format'
      });
    }

    // Soft delete by setting is_active to false
    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      {
        is_active: false,
        status: 'inactive'
      },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully (soft delete)',
      data: vendor
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
router.patch('/:id/status', async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { status } = req.body;

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

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
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
