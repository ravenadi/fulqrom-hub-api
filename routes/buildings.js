const express = require('express');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { applyScopeFiltering } = require('../middleware/authorizationRules');
const { requireIfMatch } = require('../middleware/etagVersion');

// Controller for all building business logic
const buildingController = require('../controllers/buildingController');

const router = express.Router();

// GET /api/buildings/summary/stats - Get building summary statistics
// NOTE: Must be before /:id routes to avoid conflict
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.get('/summary/stats', checkModulePermission('buildings', 'view'), buildingController.getSummaryStats);

// GET /api/buildings/by-category - Group buildings by category
// NOTE: Must be before /:id routes to avoid conflict
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.get('/by-category', checkModulePermission('buildings', 'view'), buildingController.getByCategory);

// GET /api/buildings - List all buildings with pagination and search
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.get('/', checkModulePermission('buildings', 'view'), buildingController.list);

// GET /api/buildings/:id - Get single building
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.get('/:id', checkResourcePermission('building', 'view', (req) => req.params.id), buildingController.getById);

// GET /api/buildings/:id/stats - Get building statistics (counts only)
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.get('/:id/stats', checkResourcePermission('building', 'view', (req) => req.params.id), applyScopeFiltering('document'), buildingController.getStats);

// POST /api/buildings - Create new building
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.post('/', checkModulePermission('buildings', 'create'), buildingController.create);

// PUT /api/buildings/:id - Update building
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.put('/:id', checkResourcePermission('building', 'edit', (req) => req.params.id), requireIfMatch, buildingController.update);

// DELETE /api/buildings/:id - Delete building
// Refactored to use buildingController (Phase 3 - Clean Architecture)
router.delete('/:id', checkResourcePermission('building', 'delete', (req) => req.params.id), buildingController.remove);

module.exports = router;
