const express = require('express');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch } = require('../middleware/etagVersion');

// Controller for all customer business logic
const customerController = require('../controllers/customerController');

const router = express.Router();

// GET /api/customers - List all customers with pagination and search
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.get('/', checkModulePermission('customers', 'view'), customerController.list);

// GET /api/customers/:id/stats - Get customer statistics (counts only)
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.get('/:id/stats', checkResourcePermission('customer', 'view', (req) => req.params.id), customerController.getStats);

// GET /api/customers/:id/documents - Get all documents for a specific customer
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.get('/:id/documents', checkResourcePermission('customer', 'view', (req) => req.params.id), customerController.getDocuments);

// GET /api/customers/:id/contacts/primary - Get primary contact
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.get('/:id/contacts/primary', checkResourcePermission('customer', 'view', (req) => req.params.id), customerController.getPrimaryContact);

// GET /api/customers/:id - Get single customer
// NOTE: This route must come AFTER more specific routes like /:id/documents, /:id/stats, /:id/contacts/primary
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.get('/:id', checkResourcePermission('customer', 'view', (req) => req.params.id), customerController.getById);

// POST /api/customers - Create new customer
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.post('/', checkModulePermission('customers', 'create'), customerController.create);

// PUT /api/customers/:id - Update customer
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.put('/:id', checkResourcePermission('customer', 'edit', (req) => req.params.id), requireIfMatch, customerController.update);

// DELETE /api/customers/:id - Delete customer
// Refactored to use customerController (Phase 3 - Clean Architecture)
router.delete('/:id', checkResourcePermission('customer', 'delete', (req) => req.params.id), customerController.remove);

module.exports = router;
