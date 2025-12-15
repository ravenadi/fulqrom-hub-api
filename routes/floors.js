/**
 * Floor Routes
 * Handles routing for floor CRUD operations.
 * Business logic extracted to controllers/floorController.js
 *
 * @module routes/floors
 */

const express = require('express');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch } = require('../middleware/etagVersion');
const floorController = require('../controllers/floorController');

const router = express.Router();

// GET /api/floors - List all floors with pagination and search
router.get('/', checkModulePermission('floors', 'view'), floorController.list);

// GET /api/floors/summary/stats - Get floor summary statistics
// Note: Must be before /:id to avoid matching 'summary' as an id
router.get('/summary/stats', checkModulePermission('floors', 'view'), floorController.getStats);

// GET /api/floors/by-type - Group floors by type
// Note: Must be before /:id to avoid matching 'by-type' as an id
router.get('/by-type', checkModulePermission('floors', 'view'), floorController.getByType);

// GET /api/floors/by-building/:buildingId - Get floors by building
// Note: Must be before /:id to avoid matching 'by-building' as an id
router.get('/by-building/:buildingId', checkModulePermission('floors', 'view'), floorController.getByBuilding);

// GET /api/floors/:id - Get single floor
router.get('/:id', checkResourcePermission('floor', 'view', (req) => req.params.id), floorController.getById);

// POST /api/floors - Create new floor
router.post('/', checkModulePermission('floors', 'create'), floorController.create);

// POST /api/floors/export - Export floors to CSV
router.post('/export', checkModulePermission('floors', 'export'), floorController.exportToCsv);

// PUT /api/floors/:id - Update floor
router.put('/:id', checkResourcePermission('floor', 'edit', (req) => req.params.id), requireIfMatch, floorController.update);

// DELETE /api/floors/:id - Delete floor
router.delete('/:id', checkResourcePermission('floor', 'delete', (req) => req.params.id), floorController.remove);

module.exports = router;
