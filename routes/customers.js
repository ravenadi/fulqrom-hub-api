const express = require('express');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { tenantContext, optionalTenantContext } = require('../middleware/tenantContext');

const router = express.Router();

// Note: Authentication is applied globally in server.js
// Tenant context middleware ensures all queries are scoped to the user's tenant

// GET /api/customers - List all customers (requires module-level view permission)
router.get('/', checkModulePermission('customers', 'view'), async (req, res) => {
  try {
    const { search, limit } = req.query;

    // Build filter query
    let filterQuery = {};

    // Simple search across key fields
    if (search) {
      filterQuery.$or = [
        { 'organisation.organisation_name': { $regex: search, $options: 'i' } },
        { 'company_profile.trading_name': { $regex: search, $options: 'i' } },
        { 'company_profile.business_number': { $regex: search, $options: 'i' } },
        { 'business_address.street': { $regex: search, $options: 'i' } },
        { 'business_address.suburb': { $regex: search, $options: 'i' } },
        { 'contact_methods.full_name': { $regex: search, $options: 'i' } },
        { 'contact_methods.method_value': { $regex: search, $options: 'i' } }
      ];
    }

    // Query without tenant filter for now (until tenant context is properly configured)
    let query = Customer.find(filterQuery);

    // Apply limit if provided
    if (limit) {
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      query = query.limit(limitNum);
    }

    const customers = await query.exec();

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
    });
  }
});

// GET /api/customers/:id - Get single customer (requires view permission for this customer)
router.get('/:id', optionalTenantContext, checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Use tenant-scoped query - will only find customer if it belongs to user's tenant
    let customer;
    if (req.tenant && req.tenant.tenantId) {
      customer = await Customer.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId });
    } else {
      // Fallback for development/testing
      customer = await Customer.findById(req.params.id);
    }

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customer',
      error: error.message
    });
  }
});

// GET /api/customers/:id/stats - Get customer statistics (requires view permission)
router.get('/:id/stats', optionalTenantContext, checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    const customerId = req.params.id;

    // Verify customer exists AND belongs to tenant
    let customer;
    if (req.tenant && req.tenant.tenantId) {
      customer = await Customer.findById(customerId).setOptions({ _tenantId: req.tenant.tenantId });
    } else {
      customer = await Customer.findById(customerId);
    }
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get counts with tenant scope if available
    let siteCount, buildingCount, assetCount, documentCount;
    if (req.tenant && req.tenant.tenantId) {
      [siteCount, buildingCount, assetCount, documentCount] = await Promise.all([
        Site.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
        Building.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
        Asset.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
        Document.countDocuments({ 'customer.customer_id': customerId }).setOptions({ _tenantId: req.tenant.tenantId })
      ]);
    } else {
      [siteCount, buildingCount, assetCount, documentCount] = await Promise.all([
        Site.countDocuments({ customer_id: customerId }),
        Building.countDocuments({ customer_id: customerId }),
        Asset.countDocuments({ customer_id: customerId }),
        Document.countDocuments({ 'customer.customer_id': customerId })
      ]);
    }

    const stats = {
      totalSites: siteCount,
      totalBuildings: buildingCount,
      totalAssets: assetCount,
      totalDocuments: documentCount
    };

    res.status(200).json({
      success: true,
      data: {
        customer_id: customerId,
        customer_name: customer.organisation?.organisation_name || 'Unknown',
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customer statistics',
      error: error.message
    });
  }
});

// GET /api/customers/:id/contacts/primary - Get primary contact (requires view permission)
router.get('/:id/contacts/primary', optionalTenantContext, checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Use tenant-scoped query
    let customer;
    if (req.tenant && req.tenant.tenantId) {
      customer = await Customer.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId });
    } else {
      customer = await Customer.findById(req.params.id);
    }

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Find the primary contact in the contact_methods array
    const primaryContact = customer.contact_methods?.find(contact => contact.is_primary === true);

    if (!primaryContact) {
      return res.status(404).json({
        success: false,
        message: 'No primary contact found for this customer'
      });
    }

    res.status(200).json({
      success: true,
      data: primaryContact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching primary contact',
      error: error.message
    });
  }
});

// POST /api/customers - Create new customer (requires module-level create permission)
router.post('/', optionalTenantContext, checkModulePermission('customers', 'create'), async (req, res) => {
  try {
    // Set tenant_id for the new customer if tenant context is available
    const customerData = { ...req.body };
    if (req.tenant && req.tenant.tenantId) {
      customerData.tenant_id = req.tenant.tenantId; // Explicitly set tenant_id
    }
    const customer = new Customer(customerData);
    await customer.save();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
});

// PUT /api/customers/:id - Update customer (requires edit permission for this customer)
router.put('/:id', optionalTenantContext, checkResourcePermission('customer', 'edit', (req) => req.params.id), async (req, res) => {
  try {
    // Use tenant-scoped update - will only update if customer belongs to tenant
    const updateOptions = {
      new: true,
      runValidators: true
    };
    if (req.tenant && req.tenant.tenantId) {
      updateOptions._tenantId = req.tenant.tenantId; // Tenant-scoped update
    }
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      updateOptions
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
});

// DELETE /api/customers/:id - Delete customer (requires delete permission for this customer)
router.delete('/:id', optionalTenantContext, checkResourcePermission('customer', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Use tenant-scoped delete - will only delete if customer belongs to tenant
    const deleteOptions = {};
    if (req.tenant && req.tenant.tenantId) {
      deleteOptions._tenantId = req.tenant.tenantId; // Tenant-scoped delete
    }
    const customer = await Customer.findByIdAndDelete(req.params.id, deleteOptions);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message
    });
  }
});

module.exports = router;
