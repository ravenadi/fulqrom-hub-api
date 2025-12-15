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

// Helper function to fetch entity names by IDs
async function fetchEntityNames(documentData, currentTenantId) {
  const entityNames = {
    customer_name: 'Unknown Customer',
    site_name: null,
    building_name: null,
    floor_name: null,
    tenant_name: null
  };

  try {
    // Extract IDs from different possible locations (direct or nested in location/customer objects)
    const customerId = documentData.customer?.customer_id || documentData.customer_id;
    const siteId = documentData.location?.site?.site_id || documentData.site_id;
    const buildingId = documentData.location?.building?.building_id || documentData.building_id;
    const floorId = documentData.location?.floor?.floor_id || documentData.floor_id;
    const assetId = documentData.location?.asset?.asset_id || documentData.asset_id;
    const tenantId = documentData.location?.tenant?.tenant_id || documentData.tenant_id;
    const vendorId = documentData.location?.vendor?.vendor_id || documentData.vendor_id;

    // Fetch customer name - WITH TENANT FILTERING
    if (customerId) {
      const customer = await Customer.findById(customerId.toString()).setOptions({ _tenantId: currentTenantId });
      if (customer) {
        entityNames.customer_name = customer.organisation?.organisation_name ||
                                   customer.company_profile?.trading_name ||
                                   customer.company_profile?.organisation_name ||
                                   'Unknown Customer';
      }
    }

    // Fetch site name - WITH TENANT FILTERING
    if (siteId) {
      const site = await Site.findById(siteId.toString()).setOptions({ _tenantId: currentTenantId });
      if (site) {
        entityNames.site_name = site.site_name;
      }
    }

    // Fetch building name - WITH TENANT FILTERING
    if (buildingId) {
      const building = await Building.findById(buildingId.toString()).setOptions({ _tenantId: currentTenantId });
      if (building) {
        entityNames.building_name = building.building_name;
      }
    }

    // Fetch floor name - WITH TENANT FILTERING
    if (floorId) {
      const floor = await Floor.findById(floorId.toString()).setOptions({ _tenantId: currentTenantId });
      if (floor) {
        entityNames.floor_name = floor.floor_name;
      }
    }

    // Fetch asset name (legacy single asset) - WITH TENANT FILTERING
    if (assetId) {
      const asset = await Asset.findOne({ asset_id: assetId }).setOptions({ _tenantId: currentTenantId });
      if (asset) {
        // Build asset name from available fields
        entityNames.asset_name = asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset';
        entityNames.asset_type = asset.type || asset.category;
      } else {
        // Asset not found, use default name
        entityNames.asset_name = `Asset ${assetId}`;
      }
    }

    // Fetch multiple assets - WITH TENANT FILTERING
    const assetIds = documentData.location?.assets?.map(a => a.asset_id) ||
                     (documentData.asset_ids && Array.isArray(documentData.asset_ids) ? documentData.asset_ids : []);
    if (assetIds.length > 0) {
      const assets = await Asset.find({ asset_id: { $in: assetIds } }).setOptions({ _tenantId: currentTenantId });
      entityNames.assets = assets.map(asset => ({
        asset_id: asset.asset_id,
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category || '' // Allow empty string if no type
      }));
    }

    // Fetch tenant name - WITH TENANT FILTERING
    if (tenantId) {
      const tenant = await BuildingTenant.findById(tenantId.toString()).setOptions({ _tenantId: currentTenantId });
      if (tenant) {
        entityNames.tenant_name = tenant.tenant_name;
      }
    }

    // Fetch vendor name - WITH TENANT FILTERING
    if (vendorId) {
      const vendor = await Vendor.findById(vendorId.toString()).setOptions({ _tenantId: currentTenantId });
      if (vendor) {
        entityNames.vendor_name = vendor.contractor_name;
      }
    }
  } catch (error) {

  }

  return entityNames;
}

// Batch fetch entity names for multiple documents to avoid N+1 query problem
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
    assetIds.size > 0 ? Asset.find({ asset_id: { $in: Array.from(assetIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    tenantIds.size > 0 ? BuildingTenant.find({ _id: { $in: Array.from(tenantIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : [],
    vendorIds.size > 0 ? Vendor.find({ _id: { $in: Array.from(vendorIds) } }).setOptions({ _tenantId: tenantId }).lean().exec() : []
  ]);

  // Step 3: Create lookup maps for O(1) access
  const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
  const siteMap = new Map(sites.map(s => [s._id.toString(), s]));
  const buildingMap = new Map(buildings.map(b => [b._id.toString(), b]));
  const floorMap = new Map(floors.map(f => [f._id.toString(), f]));
  const assetMap = new Map(assets.map(a => [a.asset_id, a]));
  const tenantMap = new Map(tenants.map(t => [t._id.toString(), t]));
  const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

  // Step 4: Populate documents using the maps (no additional DB queries)
  return documents.map(doc => {
    const customer = customerMap.get(doc.customer?.customer_id?.toString());
    const site = siteMap.get(doc.location?.site?.site_id?.toString());
    const building = buildingMap.get(doc.location?.building?.building_id?.toString());
    const floor = floorMap.get(doc.location?.floor?.floor_id?.toString());
    const asset = assetMap.get(doc.location?.asset?.asset_id);
    const tenant = tenantMap.get(doc.location?.tenant?.tenant_id?.toString());
    const vendor = vendorMap.get(doc.location?.vendor?.vendor_id?.toString());

    // Handle multiple assets
    const docAssetIds = doc.location?.assets?.map(a => a.asset_id) || [];
    const populatedAssets = docAssetIds
      .map(assetId => {
        const assetData = assetMap.get(assetId);
        if (assetData) {
          return {
            asset_id: assetData.asset_id,
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