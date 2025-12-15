const express = require('express');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { tenantContext } = require('../middleware/tenantContext');
const { requireIfMatch } = require('../middleware/etagVersion');

// Controller for all site business logic
const siteController = require('../controllers/siteController');

const router = express.Router();

// GET /api/sites - List all sites with filters, pagination, and sorting
// Refactored to use siteController (Phase 3 - Clean Architecture)
router.get('/', checkModulePermission('sites', 'view'), tenantContext, siteController.list);

// GET /api/sites/:id - Get single site with full details
// Refactored to use siteController (Phase 3 - Clean Architecture)
router.get('/:id', checkResourcePermission('site', 'view', (req) => req.params.id), tenantContext, siteController.getById);

// POST /api/sites - Create new site
// Refactored to use siteController (Phase 3 - Clean Architecture)
router.post('/', checkModulePermission('sites', 'create'), tenantContext, siteController.create);

// PUT /api/sites/:id - Update site
// Refactored to use siteController (Phase 3 - Clean Architecture)
router.put('/:id', checkResourcePermission('site', 'edit', (req) => req.params.id), requireIfMatch, tenantContext, siteController.update);

// DELETE /api/sites/:id - Soft delete site
// Refactored to use siteController (Phase 3 - Clean Architecture)
router.delete('/:id', checkResourcePermission('site', 'delete', (req) => req.params.id), tenantContext, siteController.remove);

module.exports = router;
