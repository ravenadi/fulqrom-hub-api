/**
 * Customer Controller
 * Handles business logic for customer CRUD operations.
 * Migrated from routes/customers.js as part of Phase 3 - Clean Architecture
 *
 * @module controllers/customerController
 */

const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { sendVersionConflict } = require('../middleware/etagVersion');
const {
  buildPagination,
  buildSort,
  handleError
} = require('../middleware/searchHelpers');
const { applyResourceFilter } = require('../utils/resourceFilter');
const entityLookupService = require('../services/entityLookupService');

/**
 * List all customers
 * GET /api/customers
 */
const list = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const { search, limit } = req.query;

    let filterQuery = {
      is_delete: { $ne: true }
    };

    filterQuery = await applyResourceFilter(req, filterQuery, 'customer');

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

    let query = Customer.find(filterQuery).setOptions({ _tenantId: req.tenant.tenantId });

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
    console.error('Error in customerController.list:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
    });
  }
};

/**
 * Get customer by ID
 * GET /api/customers/:id
 */
const getById = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customer = await Customer.findOne({
      _id: req.params.id,
      is_delete: { $ne: true }
    }).setOptions({ _tenantId: req.tenant.tenantId });

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
    console.error('Error in customerController.getById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer',
      error: error.message
    });
  }
};

/**
 * Get customer statistics
 * GET /api/customers/:id/stats
 */
const getStats = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customerId = req.params.id;

    const customer = await Customer.findById(customerId).setOptions({ _tenantId: req.tenant.tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const [siteCount, buildingCount, assetCount, documentCount] = await Promise.all([
      Site.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
      Building.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
      Asset.countDocuments({ customer_id: customerId }).setOptions({ _tenantId: req.tenant.tenantId }),
      Document.countDocuments({ 'customer.customer_id': customerId }).setOptions({ _tenantId: req.tenant.tenantId })
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
    console.error('Error in customerController.getStats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer statistics',
      error: error.message
    });
  }
};

/**
 * Get documents for a customer
 * GET /api/customers/:id/documents
 */
const getDocuments = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customerId = req.params.id;
    const { page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    const customer = await Customer.findById(customerId).setOptions({ _tenantId: req.tenant.tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    let filterQuery = {
      'customer.customer_id': customerId
    };

    const pagination = buildPagination(page, limit);
    const sortObj = buildSort(sort, order);

    let documents, totalDocuments;
    let session = null;

    try {
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

        await session.endSession();
        session = null;
      } catch (snapshotError) {
        await session.endSession();
        session = null;

        if (snapshotError.message && snapshotError.message.includes('replica set')) {
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
          throw snapshotError;
        }
      }

      const documentsWithNames = await entityLookupService.batchFetchEntityNames(documents, req.tenant.tenantId);

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
};

/**
 * Get primary contact for a customer
 * GET /api/customers/:id/contacts/primary
 */
const getPrimaryContact = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customer = await Customer.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    let primaryContact = customer.contact_methods?.find(contact => contact.is_primary === true);

    if (!primaryContact && customer.contact_methods?.length > 0) {
      primaryContact = customer.contact_methods.find(contact =>
        contact.contact_methods?.some(method => method.is_primary === true)
      );
    }

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
    console.error('Error in customerController.getPrimaryContact:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching primary contact',
      error: error.message
    });
  }
};

/**
 * Create new customer
 * POST /api/customers
 */
const create = async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const customerData = {
      ...req.body,
      tenant_id: req.tenant.tenantId
    };

    const customer = new Customer(customerData);
    await customer.save();

    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'New Customer';
    logCreate({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error in customerController.create:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
};

/**
 * Update customer
 * PUT /api/customers/:id
 */
const update = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update customer'
      });
    }

    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include If-Match header or __v in body for concurrent write safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or you do not have permission to update it'
      });
    }

    if (customer.tenant_id && customer.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Customer belongs to a different tenant'
      });
    }

    if (customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: req.params.id
      });
    }

    const updateData = { ...req.body };
    delete updateData.tenant_id;

    const allowedFields = [
      'organisation', 'company_profile', 'business_address', 'postal_address',
      'contact_methods', 'metadata', 'is_active'
    ];

    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });

    if (Object.keys(atomicUpdate).length > 0) {
      atomicUpdate.updated_at = new Date().toISOString();

      const result = await Customer.findOneAndUpdate(
        {
          _id: req.params.id,
          __v: clientVersion
        },
        {
          $set: atomicUpdate,
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true }
      );

      if (!result) {
        return sendVersionConflict(res, {
          clientVersion,
          currentVersion: customer.__v,
          resource: 'Customer',
          id: req.params.id
        });
      }

      Object.assign(customer, result.toObject());
    } else {
      await customer.save();
    }

    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'Customer';
    logUpdate({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });

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
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Customer',
        id: req.params.id
      });
    }

    console.error('Error in customerController.update:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
};

/**
 * Delete customer (soft delete)
 * DELETE /api/customers/:id
 */
const remove = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete customer'
      });
    }

    const customerId = req.params.id;

    const customer = await Customer.findOne({ _id: customerId, tenant_id: tenantId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or you do not have permission to delete it'
      });
    }

    if (customer.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Customer already deleted'
      });
    }

    console.log(`Starting soft delete for customer: ${customerId}`);

    await Customer.findByIdAndUpdate(customerId, { is_delete: true });

    const { cascadeCustomerDelete } = require('../utils/softDeleteCascade');
    await cascadeCustomerDelete(customerId, tenantId);

    const customerName = customer.organisation?.organisation_name || customer.company_profile?.trading_name || 'Customer';
    logDelete({ module: 'customer', resourceName: customerName, req, moduleId: customer._id, resource: customer.toObject() });

    console.log(`Customer soft-deleted successfully: ${customerId}`);

    return res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
      data: {
        customer_id: customerId,
        customer_name: customerName
      }
    });
  } catch (error) {
    console.error('Error in customerController.remove:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message
    });
  }
};

module.exports = {
  list,
  getById,
  getStats,
  getDocuments,
  getPrimaryContact,
  create,
  update,
  remove
};
