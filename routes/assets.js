const express = require('express');
const multer = require('multer');
const { validateCreateAsset, validateUpdateAsset } = require('../middleware/assetValidation');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch } = require('../middleware/etagVersion');

// Import controller for refactored endpoints
const assetController = require('../controllers/assetController');

const router = express.Router();

// Configure multer for CSV file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// GET /api/assets - List all assets
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.get('/', checkModulePermission('assets', 'view'), assetController.list);

// GET /api/assets/:id - Get single asset
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.get('/:id', checkResourcePermission('asset', 'view', (req) => req.params.id), assetController.getById);

// POST /api/assets - Create new asset
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.post('/', checkModulePermission('assets', 'create'), validateCreateAsset, assetController.create);

// PUT /api/assets/:id - Update asset
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.put('/:id', checkResourcePermission('asset', 'edit', (req) => req.params.id), requireIfMatch, validateUpdateAsset, assetController.update);


// DELETE /api/assets/bulk - Bulk delete assets
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.delete('/bulk', checkModulePermission('assets', 'delete'), assetController.bulkRemove);

// DELETE /api/assets/:id - Delete asset
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.delete('/:id', checkResourcePermission('asset', 'delete', (req) => req.params.id), assetController.remove);

// GET /api/assets/by-building/:buildingId - Get assets by building
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.get('/by-building/:buildingId', checkModulePermission('assets', 'view'), assetController.getByBuilding);

// GET /api/assets/by-category - Group assets by category
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.get('/by-category', checkModulePermission('assets', 'view'), assetController.getByCategory);

// GET /api/assets/summary/stats - Get asset summary statistics
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.get('/summary/stats', checkModulePermission('assets', 'view'), assetController.getSummaryStats);


// POST /api/assets/export - Export assets to CSV
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.post('/export', checkModulePermission('assets', 'export'), assetController.exportCSV);

// POST /api/assets/import - Import assets from CSV
// Refactored to use assetController (Phase 2 - Clean Architecture)
router.post('/import', checkModulePermission('assets', 'create'), upload.single('file'), assetController.importCSV);

module.exports = router;