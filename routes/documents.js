const express = require('express');
const multer = require('multer');
const {
  validateCreateDocument,
  validateUpdateDocument,
  validateQueryParams,
  validateObjectId
} = require('../middleware/documentValidation');
const { applyScopeFiltering } = require('../middleware/authorizationRules');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch } = require('../middleware/etagVersion');
const { uploadLimiter } = require('../middleware/rateLimiter');

// Controller for all document business logic
const documentController = require('../controllers/documentController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB
  }
});

/**
 * Wrapper to preserve AsyncLocalStorage context through multer middleware
 * Multer v2.x breaks ALS context, causing tenant context to be lost
 * This wrapper captures the ALS store before multer and restores it after
 *
 * @param {Function} multerMiddleware - The multer middleware (e.g., upload.single('file'))
 * @returns {Function} Wrapped middleware that preserves ALS context
 */
function preserveALSContext(multerMiddleware) {
  const { asyncLocalStorage } = require('../utils/requestContext');

  return (req, res, next) => {
    // Capture the current ALS store before multer processes the request
    const store = asyncLocalStorage.getStore();

    // Run multer middleware
    multerMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }

      // Restore the ALS context after multer finishes
      if (store) {
        asyncLocalStorage.enterWith(store);
      }

      next();
    });
  };
}

const router = express.Router();

// GET /api/documents - List all documents with advanced search and filtering
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/', checkModulePermission('documents', 'view'), applyScopeFiltering('document'), validateQueryParams, documentController.list);

// GET /api/documents/tags - Get unique tags
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/tags', documentController.getTags);

// GET /api/documents/stats - Get document statistics
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/stats', documentController.getStats);

// GET /api/documents/:id - Get single document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id', checkModulePermission('documents', 'view'), validateObjectId, documentController.getById);

// Duplicate route removed - see line 2980 for the primary download endpoint with proper validation

// GET /api/documents/:id/preview - Generate presigned URL for document preview
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/preview', validateObjectId, documentController.getPreviewUrl);

// POST /api/documents - Create new document with file upload
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/', uploadLimiter, checkModulePermission('documents', 'create'), preserveALSContext(upload.single('file')), validateCreateDocument, documentController.create);

// PUT /api/documents/bulk-update - Bulk update multiple documents
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.put('/bulk-update', requireIfMatch, documentController.bulkUpdate);

// PUT /api/documents/:id - Update document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.put('/:id', checkModulePermission('documents', 'edit'), requireIfMatch, validateObjectId, documentController.update);

// DELETE /api/documents/bulk - Bulk delete documents
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.delete('/bulk', checkModulePermission('documents', 'delete'), documentController.bulkRemove);

// DELETE /api/documents/:id - Delete document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.delete('/:id', checkModulePermission('documents', 'delete'), documentController.remove);

// GET /api/documents/by-type/:type - Get documents by type with search
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/by-type/:type', documentController.getByType);

// GET /api/documents/by-building/:buildingId - Get documents by building with search
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/by-building/:buildingId', documentController.getByBuilding);

// GET /api/documents/summary/stats - Get document summary statistics
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/summary/stats', documentController.getSummaryStats);

// GET /api/storage/stats - Get document storage statistics
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/storage/stats', documentController.getStorageStats);

// GET /api/documents/by-category - Group documents by category
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/by-category', documentController.getByCategory);

// GET /api/documents/options/entities - Get dropdown options for customers, sites, buildings, etc.
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/options/entities', documentController.getOptionsEntities);

// ==================== APPROVAL WORKFLOW ENDPOINTS ====================

const {
  validateRequestApproval,
  validateApprove,
  validateReject,
  validateRevokeApproval
} = require('../middleware/approvalValidation');

// POST /api/documents/:id/request-approval - Request approval for a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/:id/request-approval', validateObjectId, validateRequestApproval, requireIfMatch, documentController.requestApproval);

// PUT /api/documents/:id/approve - Approve a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.put('/:id/approve', validateObjectId, validateApprove, requireIfMatch, documentController.approve);

// PUT /api/documents/:id/reject - Reject a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.put('/:id/reject', validateObjectId, validateReject, requireIfMatch, documentController.reject);

// PUT /api/documents/:id/revoke-approval - Revoke/cancel approval request
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.put('/:id/revoke-approval', validateObjectId, validateRevokeApproval, requireIfMatch, documentController.revokeApproval);

// GET /api/documents/pending-approval - Get documents pending approval
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/pending-approval', documentController.getPendingApproval);

// GET /api/documents/:id/approval-history - Get approval history for a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/approval-history', validateObjectId, documentController.getApprovalHistory);

// ==================== DOCUMENT VERSIONING ENDPOINTS ====================

// POST /api/documents/:id/versions - Upload new version of document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/:id/versions', uploadLimiter, preserveALSContext(upload.single('file')), validateObjectId, documentController.uploadVersion);

// GET /api/documents/:id/version-history - Get version history from single document record
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/version-history', validateObjectId, documentController.getVersionHistory);

// GET /api/documents/versions/:documentGroupId - Get all versions of a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/versions/:documentGroupId', documentController.getVersionsByGroupId);

// GET /api/documents/versions/:versionId/download - Download specific version
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/versions/:versionId/download', validateObjectId, documentController.downloadVersionById);

// GET /api/documents/:id/download-version/:versionSequence - Download a specific version from single-record history
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/download-version/:versionSequence', validateObjectId, documentController.downloadVersionBySequence);

// POST /api/documents/:id/restore-version - Restore a version from single-record version history
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/:id/restore-version', validateObjectId, documentController.restoreVersion);

// DELETE /api/documents/:id/delete-version - Delete a version from single-record version history
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.delete('/:id/delete-version', validateObjectId, documentController.deleteVersion);

// POST /api/documents/versions/:versionId/restore - Restore old version as current
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/versions/:versionId/restore', validateObjectId, documentController.restoreVersionById);

// ===== DOCUMENT REVIEW ENDPOINTS =====

// GET /api/documents/:id/comments - Get all comments for a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/comments', validateObjectId, documentController.getComments);

// POST /api/documents/:id/review - Submit a review for a document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/:id/review', validateObjectId, documentController.submitReview);

// GET /api/documents/:id/download - Get download URL for document
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.get('/:id/download', validateObjectId, documentController.getDownloadUrl);

// POST /api/documents/export - Export documents to CSV and upload to S3
// Refactored to use documentController (Phase 2 - Clean Architecture)
router.post('/export', checkModulePermission('documents', 'export'), documentController.exportCSV);

module.exports = router;