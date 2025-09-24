const express = require('express');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');
const {
  createCustomerSchema,
  updateCustomerSchema,
  queryParamsSchema,
  objectIdSchema
} = require('../schemas/customerSchemas');
const {
  validateBody,
  validateParams,
  validateQuery,
  validateUniqueABN,
  formatResponse,
  parsePagination,
  parseSearch
} = require('../middleware/validation');

const router = express.Router();

// Apply response formatting to all routes
router.use(formatResponse);

// GET /api/customers - List all customers with pagination, search, and filtering
router.get('/',
  validateQuery(queryParamsSchema),
  parsePagination,
  parseSearch,
  async (req, res, next) => {
    try {
      const { status, state } = req.query;
      const { page, limit, skip } = req.pagination;

      // Build filter query
      let filterQuery = { ...req.searchQuery };

      if (req.query.is_active !== undefined) {
        filterQuery.is_active = req.query.is_active;
      }

      if (state) {
        filterQuery['business_address.state'] = state;
      }

      // Get total count for pagination
      const totalCount = await Customer.countDocuments(filterQuery);
      const totalPages = Math.ceil(totalCount / limit);

      // Get customers with pagination
      const customers = await Customer.find(filterQuery)
        .sort(req.sortOptions)
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        count: customers.length,
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        data: customers
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id - Get single customer
router.get('/:id',
  validateParams(objectIdSchema),
  async (req, res, next) => {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
          details: {
            customerId: req.params.id
          }
        });
      }

      res.status(200).json({
        success: true,
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/customers - Create new customer
router.post('/',
  validateBody(createCustomerSchema),
  validateUniqueABN(Customer),
  async (req, res, next) => {
    try {
      const customer = new Customer(req.body);
      await customer.save();

      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/customers/:id - Update customer
router.put('/:id',
  validateParams(objectIdSchema),
  validateBody(updateCustomerSchema),
  validateUniqueABN(Customer),
  async (req, res, next) => {
    try {
      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true, // Return updated document
          runValidators: true // Run mongoose validators
        }
      );

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
          details: {
            customerId: req.params.id
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Customer updated successfully',
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/customers/:id - Delete customer
router.delete('/:id',
  validateParams(objectIdSchema),
  async (req, res, next) => {
    try {
      const customer = await Customer.findByIdAndDelete(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
          details: {
            customerId: req.params.id
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Customer deleted successfully',
        data: {
          deletedCustomer: {
            id: customer._id,
            organisationName: customer.organisationName,
            abn: customer.abn
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/debug/collections - Debug route to see available collections
router.get('/debug/collections', async (req, res, next) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    res.status(200).json({
      success: true,
      collections: collections.map(c => c.name),
      currentModel: 'customers'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;