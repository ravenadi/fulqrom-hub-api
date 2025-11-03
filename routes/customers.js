const express = require('express');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');
const {
  buildPagination,
  buildSort,
  buildApiResponse,
  handleError
} = require('../middleware/searchHelpers');

const router = express.Router();

// Note: Authentication is applied globally in server.js

// GET /api/customers - List all customers (requires module-level view permission)
router.get('/', checkModulePermission('customers', 'view'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

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

    // Query with tenant filter - only show customers for the logged-in user's tenant
    let query = Customer.find(filterQuery).setOptions({ _tenantId: req.tenant.tenantId });

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

// GET /api/customers/:id/stats - Get customer statistics (requires view permission)
router.get('/:id/stats', checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customerId = req.params.id;

    // Find customer within tenant scope
    const customer = await Customer.findById(customerId).setOptions({ _tenantId: req.tenant.tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get counts - also scoped by tenant
    try {
      const [siteCount, buildingCount, assetCount, documentCount] = await Promise.all([
        Site.countDocuments({ customer_id: customerId })
          .setOptions({ _tenantId: req.tenant.tenantId }),
        Building.countDocuments({ customer_id: customerId })
          .setOptions({ _tenantId: req.tenant.tenantId }),
        Asset.countDocuments({ customer_id: customerId })
          .setOptions({ _tenantId: req.tenant.tenantId }),
        Document.countDocuments({ 'customer.customer_id': customerId })
          .setOptions({ _tenantId: req.tenant.tenantId })
      ]);
      
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching customer statistics',
      error: error.message
    });
  }
});

// Helper function to batch fetch entity names for documents (reused from documents route)
async function batchFetchEntityNames(documents, tenantId) {
  if (!documents || documents.length === 0) {
    return [];
  }

  // Step 1: Collect all unique IDs from all documents
  const customerIds = new Set();
  const siteIds = new Set();
  const buildingIds = new Set();
  const floorIds = new Set();
  const assetIds = new Set();
  const tenantIds = new Set();
  const vendorIds = new Set();

  documents.forEach(doc => {
    const customerId = doc.customer?.customer_id;
    const siteId = doc.location?.site?.site_id;
    const buildingId = doc.location?.building?.building_id;
    const floorId = doc.location?.floor?.floor_id;
    const assetId = doc.location?.asset?.asset_id;
    const tenantId = doc.location?.tenant?.tenant_id;
    const vendorId = doc.location?.vendor?.vendor_id;

    if (customerId) customerIds.add(customerId.toString());
    if (siteId) siteIds.add(siteId.toString());
    if (buildingId) buildingIds.add(buildingId.toString());
    if (floorId) floorIds.add(floorId.toString());
    if (assetId) assetIds.add(assetId.toString());
    if (tenantId) tenantIds.add(tenantId.toString());
    if (vendorId) vendorIds.add(vendorId.toString());

    // Collect multiple assets if present
    const docAssetIds = doc.location?.assets?.map(a => a.asset_id) || [];
    docAssetIds.forEach(id => {
      if (id) assetIds.add(id.toString());
    });
  });

  // Step 2: Fetch ALL entities in parallel with batch queries - WITH TENANT FILTERING
  const [customers, sites, buildings, floors, assets, tenants, vendors] = await Promise.all([
    customerIds.size > 0 ? Customer.find({ _id: { $in: Array.from(customerIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    siteIds.size > 0 ? Site.find({ _id: { $in: Array.from(siteIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    buildingIds.size > 0 ? Building.find({ _id: { $in: Array.from(buildingIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    floorIds.size > 0 ? Floor.find({ _id: { $in: Array.from(floorIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    assetIds.size > 0 ? Asset.find({ _id: { $in: Array.from(assetIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    tenantIds.size > 0 ? BuildingTenant.find({ _id: { $in: Array.from(tenantIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    vendorIds.size > 0 ? Vendor.find({ _id: { $in: Array.from(vendorIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : []
  ]);

  // Step 3: Create lookup maps for O(1) access
  const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
  const siteMap = new Map(sites.map(s => [s._id.toString(), s]));
  const buildingMap = new Map(buildings.map(b => [b._id.toString(), b]));
  const floorMap = new Map(floors.map(f => [f._id.toString(), f]));
  const assetMap = new Map(assets.map(a => [a._id.toString(), a]));
  const tenantMap = new Map(tenants.map(t => [t._id.toString(), t]));
  const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

  // Step 4: Populate documents using the maps (no additional DB queries)
  return documents.map(doc => {
    const customer = customerMap.get(doc.customer?.customer_id?.toString());
    const site = siteMap.get(doc.location?.site?.site_id?.toString());
    const building = buildingMap.get(doc.location?.building?.building_id?.toString());
    const floor = floorMap.get(doc.location?.floor?.floor_id?.toString());
    const asset = assetMap.get(doc.location?.asset?.asset_id?.toString());
    const tenant = tenantMap.get(doc.location?.tenant?.tenant_id?.toString());
    const vendor = vendorMap.get(doc.location?.vendor?.vendor_id?.toString());

    // Handle multiple assets
    const docAssetIds = doc.location?.assets?.map(a => a.asset_id) || [];
    const populatedAssets = docAssetIds
      .map(assetId => {
        const assetData = assetMap.get(assetId.toString());
        if (assetData) {
          return {
            asset_id: assetData._id.toString(),
            asset_name: assetData.asset_no || assetData.device_id || assetData.asset_id || 'Unknown Asset',
            asset_type: assetData.type || assetData.category || ''
          };
        }
        return null;
      })
      .filter(a => a !== null);

    return {
      ...doc,
      customer: {
        customer_id: doc.customer?.customer_id,
        customer_name: customer
          ? (customer.organisation?.organisation_name ||
             customer.company_profile?.trading_name ||
             customer.company_profile?.organisation_name ||
             'Unknown Customer')
          : 'Unknown Customer'
      },
      location: {
        site: doc.location?.site?.site_id ? {
          site_id: doc.location.site.site_id,
          site_name: site?.site_name || null
        } : undefined,
        building: doc.location?.building?.building_id ? {
          building_id: doc.location.building.building_id,
          building_name: building?.building_name || null
        } : undefined,
        floor: doc.location?.floor?.floor_id ? {
          floor_id: doc.location.floor.floor_id,
          floor_name: floor?.floor_name || null
        } : undefined,
        // Multiple assets support
        assets: populatedAssets.length > 0 ? populatedAssets : undefined,
        // Legacy single asset (for backward compatibility)
        asset: doc.location?.asset?.asset_id ? {
          asset_id: doc.location.asset.asset_id,
          asset_name: asset?.asset_no || asset?.device_id || asset?.asset_id || 'Unknown Asset',
          asset_type: asset?.type || asset?.category
        } : undefined,
        tenant: doc.location?.tenant?.tenant_id ? {
          tenant_id: doc.location.tenant.tenant_id,
          tenant_name: tenant?.tenant_name || null
        } : undefined,
        vendor: doc.location?.vendor?.vendor_id ? {
          vendor_id: doc.location.vendor.vendor_id,
          vendor_name: vendor?.contractor_name || null
        } : undefined
      }
    };
  });
}

// GET /api/customers/:id/documents - Get all documents for a specific customer
router.get('/:id/documents', checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customerId = req.params.id;
    const { page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    // Find customer within tenant scope
    const customer = await Customer.findById(customerId).setOptions({ _tenantId: req.tenant.tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Build filter query for documents
    let filterQuery = {
      'customer.customer_id': customerId
    };

    // Pagination and sorting
    const pagination = buildPagination(page, limit);
    const sortObj = buildSort(sort, order);

    // Execute queries in parallel with snapshot isolation for consistent reads
    // Fall back to regular queries if MongoDB is not configured as a replica set
    const mongoose = require('mongoose');
    
    let documents, totalDocuments;
    let session = null;
    
    try {
      // Try using read concern snapshot for consistent statistics (requires replica set)
      session = await mongoose.startSession();
      
      try {
        [documents, totalDocuments] = await Promise.all([
          Document.find(filterQuery)
            .setOptions({ _tenantId: req.tenant.tenantId })
            .session(session)
            .readConcern('snapshot')
            .sort(sortObj)
            .skip(pagination.skip)
            .limit(pagination.limitNum)
            .lean()
            .exec(),
          Document.countDocuments(filterQuery)
            .setOptions({ _tenantId: req.tenant.tenantId })
            .session(session)
            .readConcern('snapshot')
            .exec()
        ]);
        
        // Successfully used snapshot - end session
        await session.endSession();
        session = null;
      } catch (snapshotError) {
        // End session before retrying without it
        await session.endSession();
        session = null;
        
        // If snapshot read concern fails (e.g., not a replica set), fall back to regular queries
        if (snapshotError.message && snapshotError.message.includes('replica set')) {
          // Retry without readConcern and without session
          [documents, totalDocuments] = await Promise.all([
            Document.find(filterQuery)
              .setOptions({ _tenantId: req.tenant.tenantId })
              .sort(sortObj)
              .skip(pagination.skip)
              .limit(pagination.limitNum)
              .lean()
              .exec(),
            Document.countDocuments(filterQuery)
              .setOptions({ _tenantId: req.tenant.tenantId })
              .exec()
          ]);
        } else {
          // If it's a different error, rethrow it
          throw snapshotError;
        }
      }
      
      // Batch populate entity names for all documents
      const documentsWithNames = await batchFetchEntityNames(documents, req.tenant.tenantId);

    // Build response with customer info (read-only) and documents
    const response = {
      success: true,
      customer: {
        _id: customer._id,
        customer_id: customer._id,
        customer_name: customer.organisation?.organisation_name || 
                      customer.company_profile?.trading_name || 
                      customer.company_profile?.organisation_name || 
                      'Unknown Customer',
        read_only: true
      },
      data: documentsWithNames,
      pagination: {
        total: totalDocuments,
        page: pagination.pageNum,
        limit: pagination.limitNum,
        total_pages: Math.ceil(totalDocuments / pagination.limitNum)
      }
    };

      res.status(200).json(response);
    } catch (error) {
      // Ensure session is ended in case of any error
      if (session) {
        try {
          await session.endSession();
        } catch (sessionError) {
          // Ignore session cleanup errors
        }
      }
      handleError(error, res, 'fetching customer documents');
    }
  } catch (error) {
    handleError(error, res, 'fetching customer documents');
  }
});

// GET /api/customers/:id/contacts/primary - Get primary contact (requires view permission)
router.get('/:id/contacts/primary', checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Find customer within tenant scope
    const customer = await Customer.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId });

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

// GET /api/customers/:id - Get single customer (requires view permission for this customer)
// NOTE: This route must come AFTER more specific routes like /:id/documents, /:id/stats, /:id/contacts/primary
router.get('/:id', checkResourcePermission('customer', 'view', (req) => req.params.id), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Find customer within tenant scope only
    const customer = await Customer.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId });

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

// POST /api/customers - Create new customer (requires module-level create permission)
router.post('/', checkModulePermission('customers', 'create'), async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Create customer with tenant_id automatically assigned
    const customerData = {
      ...req.body,
      tenant_id: req.tenant.tenantId
    };

    const customer = new Customer(customerData);
    await customer.save();

    // Log audit for customer creation
    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'New Customer';
    await logCreate({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });

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
router.put('/:id', checkResourcePermission('customer', 'edit', (req) => req.params.id), requireIfMatch, async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update customer'
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

    // Load customer document (tenant-scoped automatically via plugin)
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or you do not have permission to update it'
      });
    }

    // Verify tenant ownership
    if (customer.tenant_id && customer.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Customer belongs to a different tenant'
      });
    }

    // Check version match for optimistic concurrency control
    if (customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: req.params.id
      });
    }

    // Prevent tenant_id from being changed
    const updateData = { ...req.body };
    delete updateData.tenant_id;

    // Use atomic findOneAndUpdate instead of Object.assign to prevent lost updates
    // Only update fields that are explicitly provided (preserve existing data)
    const allowedFields = [
      'organisation', 'company_profile', 'business_address', 'postal_address',
      'contact_methods', 'metadata', 'is_active', 'plan_id', 'plan_start_date',
      'plan_end_date', 'is_trial', 'trial_start_date', 'trial_end_date'
    ];
    
    // Filter out undefined/null fields and non-allowed fields to preserve existing data
    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });
    
    // Add updated_at if updates exist
    if (Object.keys(atomicUpdate).length > 0) {
      atomicUpdate.updated_at = new Date().toISOString();
      
      // Perform atomic update with version check
      const result = await Customer.findOneAndUpdate(
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
          currentVersion: customer.__v,
          resource: 'Customer',
          id: req.params.id
        });
      }
      
      // Update customer reference for audit logging
      Object.assign(customer, result.toObject());
    } else {
      // No valid updates, just save (no changes)
      await customer.save();
    }

    // Log audit for customer update
    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'Customer';
    await logUpdate({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });
    
    // Emit socket notification for real-time updates
    const socketManager = require('../utils/socketManager');
    socketManager.emitCustomerUpdate(customer._id.toString(), {
      tenant_id: customer.tenant_id?.toString(),
      updatedBy: req.user?.name || req.user?.email || 'Unknown user',
      customer_name: customerName,
      organisation_name: customer.organisation?.organisation_name,
      trading_name: customer.company_profile?.trading_name,
      updatedAt: customer.updated_at || new Date().toISOString(),
      version: customer.__v
    });

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    // Handle Mongoose VersionError (shouldn't happen with manual check above, but safety net)
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Customer',
        id: req.params.id
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
});

// DELETE /api/customers/:id - Delete customer with cascading deletions (requires delete permission for this customer)
router.delete('/:id', checkResourcePermission('customer', 'delete', (req) => req.params.id), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete customer'
      });
    }

    const customerId = req.params.id;
    const {
      delete_s3 = 'true',
      immediate_s3_delete = 'false'
    } = req.query;

    // Convert query params to booleans
    const shouldDeleteS3 = delete_s3 === 'true';
    const isImmediateS3Delete = immediate_s3_delete === 'true';

    // Verify customer exists and belongs to tenant
    const customer = await Customer.findOne({ _id: customerId, tenant_id: tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or you do not have permission to delete it'
      });
    }

    // Use comprehensive deletion service
    const CustomerDeletionService = require('../services/customerDeletionService');
    const deletionService = new CustomerDeletionService();

    console.log(`🗑️  Starting customer deletion: ${customerId}`);
    console.log(`   S3 Strategy: ${isImmediateS3Delete ? 'IMMEDIATE DELETE' : 'TAG FOR EXPIRY (90 days)'}`);

    // Log audit for customer deletion (before deletion completes)
    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'Customer';
    await logDelete({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });

    const result = await deletionService.deleteCustomerCompletely(customerId, tenantId, {
      deleteS3Files: shouldDeleteS3 && isImmediateS3Delete,
      setS3Expiry: shouldDeleteS3 && !isImmediateS3Delete,
      deleteDatabase: true,
      adminUserId: req.user?.id,
      adminEmail: req.user?.email
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          customer_id: result.customer_id,
          customer_name: result.customer_name,
          deletion_type: result.deletion_type,
          records_deleted: result.counts,
          s3_deletion_type: isImmediateS3Delete ? 'immediate' : 'tagged_for_expiry',
          deletion_log: result.deletion_log,
          errors: result.errors
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.errors,
        deletion_log: result.deletion_log
      });
    }
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message
    });
  }
});

module.exports = router;
