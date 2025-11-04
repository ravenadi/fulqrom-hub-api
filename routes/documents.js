const express = require('express');
const multer = require('multer');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const Document = require('../models/Document');
const DocumentComment = require('../models/DocumentComment');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const { uploadFileToS3, generatePresignedUrl, generatePreviewUrl, deleteFileFromS3 } = require('../utils/s3Upload');
const TenantS3Service = require('../services/tenantS3Service');
const Tenant = require('../models/Tenant');
const {
  validateCreateDocument,
  validateUpdateDocument,
  validateQueryParams,
  validateObjectId
} = require('../middleware/documentValidation');
const { applyScopeFiltering } = require('../middleware/authorizationRules');

// TODO: Refactor to use centralized authHelper.getUserId() instead of req.user?.userId || req.user?.sub
const {
  escapeRegex,
  buildSearchQuery,
  buildPagination,
  buildSort,
  isValidObjectId,
  buildApiResponse,
  handleError,
  sanitizeQuery
} = require('../middleware/searchHelpers');
const emailService = require('../utils/emailService');
const notificationService = require('../utils/notificationService');
const { sendNotificationAsync, sendEmailAsync } = require('../utils/asyncHelpers');
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');

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
      const asset = await Asset.findById(assetId.toString()).setOptions({ _tenantId: currentTenantId });
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
      const assets = await Asset.find({ _id: { $in: assetIds.map(id => id.toString()) } }).setOptions({ _tenantId: currentTenantId });
      entityNames.assets = assets.map(asset => ({
        asset_id: asset._id.toString(),
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

// GET /api/documents - List all documents with advanced search and filtering
router.get('/', checkModulePermission('documents', 'view'), applyScopeFiltering('document'), validateQueryParams, async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const sanitizedQuery = sanitizeQuery(req.query);
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      asset_id,
      tenant_id,
      vendor_id,
      category,
      type,
      status,
      engineering_discipline,
      regulatory_framework,
      compliance_status,
      drawing_status,
      prepared_by,
      approved_by_user,
      access_level,
      tag,
      tags,
      search,
      page = 1,
      limit = 50,
      sort = 'created_at',
      order = 'desc'
    } = sanitizedQuery;

    // Build filter query
    let filterQuery = {
      is_delete: { $ne: true }  // Exclude soft-deleted records
    };

    // Entity filters (multi-select support)
    if (customer_id) {
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filterQuery['customer.customer_id'] = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }
    if (site_id) {
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filterQuery['location.site.site_id'] = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }
    if (building_id) {
      const buildingIds = building_id.includes(',')
        ? building_id.split(',').map(id => id.trim())
        : building_id;
      filterQuery['location.building.building_id'] = Array.isArray(buildingIds) ? { $in: buildingIds } : buildingIds;
    }
    if (floor_id) {
      const floorIds = floor_id.includes(',')
        ? floor_id.split(',').map(id => id.trim())
        : floor_id;
      filterQuery['location.floor.floor_id'] = Array.isArray(floorIds) ? { $in: floorIds } : floorIds;
    }
    if (asset_id) {
      const assetIds = asset_id.includes(',')
        ? asset_id.split(',').map(id => id.trim())
        : [asset_id];

      // Support both single asset (legacy) and multiple assets (new)
      // For arrays of objects in MongoDB, use $elemMatch or direct field access
      const assetFilter = {
        $or: [
          { 'location.asset.asset_id': { $in: assetIds } }, // Legacy single asset
          { 'location.assets': { $elemMatch: { asset_id: { $in: assetIds } } } }  // New multiple assets array
        ]
      };
      
      // Merge with existing filterQuery
      if (filterQuery.$or) {
        // If $or already exists (e.g., from search), combine with $and
        filterQuery.$and = filterQuery.$and || [];
        filterQuery.$and.push(assetFilter);
      } else {
        // No existing $or, add directly
        Object.assign(filterQuery, assetFilter);
      }
    }
    if (tenant_id) {
      const tenantIds = tenant_id.includes(',')
        ? tenant_id.split(',').map(id => id.trim())
        : tenant_id;
      filterQuery['location.tenant.tenant_id'] = Array.isArray(tenantIds) ? { $in: tenantIds } : tenantIds;
    }
    if (vendor_id) {
      const vendorIds = vendor_id.includes(',')
        ? vendor_id.split(',').map(id => id.trim())
        : vendor_id;
      filterQuery['location.vendor.vendor_id'] = Array.isArray(vendorIds) ? { $in: vendorIds } : vendorIds;
    }

    // Document filters (multi-select support)
    if (category) {
      const categories = category.includes(',')
        ? category.split(',').map(c => c.trim())
        : category;
      filterQuery.category = Array.isArray(categories) ? { $in: categories } : categories;
    }
    if (type) {
      const types = type.includes(',')
        ? type.split(',').map(t => t.trim())
        : type;
      filterQuery.type = Array.isArray(types) ? { $in: types } : types;
    }
    if (status) {
      const statuses = status.includes(',')
        ? status.split(',').map(s => s.trim())
        : status;
      filterQuery.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }
    if (engineering_discipline) {
      const disciplines = engineering_discipline.includes(',')
        ? engineering_discipline.split(',').map(d => d.trim())
        : engineering_discipline;
      filterQuery.engineering_discipline = Array.isArray(disciplines) ? { $in: disciplines } : disciplines;
    }

    // Apply document category/discipline access restrictions (Fine-Grained Permissions)
    if (req.documentFilters && !req.documentFilters.hasFullAccess) {
      // User has category restrictions - apply them
      if (req.documentFilters.allowedCategories && req.documentFilters.allowedCategories.length > 0) {
        // If user already specified a category filter, intersect with allowed categories
        if (filterQuery.category) {
          const existingCategories = Array.isArray(filterQuery.category.$in)
            ? filterQuery.category.$in
            : [filterQuery.category];
          const allowedSet = new Set(req.documentFilters.allowedCategories);
          const intersection = existingCategories.filter(cat => allowedSet.has(cat));

          if (intersection.length === 0) {
            // No overlap - user has no access
            filterQuery.category = { $in: [] };
          } else {
            filterQuery.category = { $in: intersection };
          }
        } else {
          // No user filter - apply allowed categories restriction
          filterQuery.category = { $in: req.documentFilters.allowedCategories };
        }
      }

      // User has discipline restrictions - apply them
      if (req.documentFilters.allowedDisciplines && req.documentFilters.allowedDisciplines.length > 0) {
        // If user already specified a discipline filter, intersect with allowed disciplines
        if (filterQuery.engineering_discipline) {
          const existingDisciplines = Array.isArray(filterQuery.engineering_discipline.$in)
            ? filterQuery.engineering_discipline.$in
            : [filterQuery.engineering_discipline];
          const allowedSet = new Set(req.documentFilters.allowedDisciplines);
          const intersection = existingDisciplines.filter(disc => allowedSet.has(disc));

          if (intersection.length === 0) {
            // No overlap - user has no access
            filterQuery.engineering_discipline = { $in: [] };
          } else {
            filterQuery.engineering_discipline = { $in: intersection };
          }
        } else {
          // No user filter - apply allowed disciplines restriction
          filterQuery.engineering_discipline = { $in: req.documentFilters.allowedDisciplines };
        }
      }

      // If user has NO allowed categories and NO allowed disciplines, they shouldn't see any documents
      if (req.documentFilters.allowedCategories.length === 0 &&
          req.documentFilters.allowedDisciplines.length === 0) {
        filterQuery._id = { $in: [] }; // Return empty result set
      }
    }

    // Compliance filters (multi-select support)
    if (regulatory_framework) {
      const frameworks = regulatory_framework.includes(',')
        ? regulatory_framework.split(',').map(f => f.trim())
        : regulatory_framework;
      filterQuery['metadata.regulatory_framework'] = Array.isArray(frameworks) ? { $in: frameworks } : frameworks;
    }
    if (compliance_status) {
      const statuses = compliance_status.includes(',')
        ? compliance_status.split(',').map(s => s.trim())
        : compliance_status;
      filterQuery['metadata.compliance_status'] = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }

    // Drawing Register filters (multi-select support)
    if (drawing_status) {
      const statuses = drawing_status.includes(',')
        ? drawing_status.split(',').map(s => s.trim())
        : drawing_status;
      filterQuery['drawing_info.drawing_status'] = Array.isArray(statuses) ? { $in: statuses } : statuses;
    }
    if (prepared_by) {
      const preparers = prepared_by.includes(',')
        ? prepared_by.split(',').map(p => p.trim())
        : prepared_by;
      filterQuery['drawing_info.prepared_by'] = Array.isArray(preparers) ? { $in: preparers } : preparers;
    }
    if (approved_by_user) {
      const approvers = approved_by_user.includes(',')
        ? approved_by_user.split(',').map(a => a.trim())
        : approved_by_user;
      filterQuery['drawing_info.approved_by_user'] = Array.isArray(approvers) ? { $in: approvers } : approvers;
    }

    // Access Control filters (multi-select support)
    if (access_level) {
      const levels = access_level.includes(',')
        ? access_level.split(',').map(l => l.trim())
        : access_level;
      filterQuery['access_control.access_level'] = Array.isArray(levels) ? { $in: levels } : levels;
    }

    // Tags filter (multi-select support with case-insensitive matching)
    // Support both 'tag' (singular) and 'tags' (plural) query parameters
    const tagParam = tag || tags;
    if (tagParam) {
      const tagsList = tagParam.includes(',')
        ? tagParam.split(',').map(t => t.trim())
        : tagParam;
      const tagArray = Array.isArray(tagsList) ? tagsList : [tagsList];
      // Case-insensitive matching for tags
      filterQuery['tags.tags'] = {
        $in: tagArray.map(t => new RegExp(`^${escapeRegex(t)}$`, 'i'))
      };
    }

    // Advanced search
    const searchQuery = buildSearchQuery(search);
    if (Object.keys(searchQuery).length > 0) {
      filterQuery = { ...filterQuery, ...searchQuery };
    }

    // Filter out version documents (legacy records) - we now maintain version history in version_history array
    if (filterQuery.category && filterQuery.category.$in) {
      // If category filter is already an array, filter out 'Version' from it
      filterQuery.category.$in = filterQuery.category.$in.filter(cat => cat !== 'Version');
    } else if (filterQuery.category && typeof filterQuery.category === 'object' && !filterQuery.category.$ne) {
      // If category already has filters, add $ne condition
      filterQuery.category = { ...filterQuery.category, $ne: 'Version' };
    } else {
      // If no category filter, just exclude Version
      filterQuery.category = { $ne: 'Version' };
    }

    // Pagination and sorting
    const pagination = buildPagination(page, limit);
    const sortObj = buildSort(sort, order);

    // Execute queries in parallel for better performance - with tenant filtering
    const [documents, totalDocuments, categoryStats] = await Promise.all([
      Document.find(filterQuery)
        .setOptions({ _tenantId: req.tenant.tenantId })
        .sort(sortObj)
        .skip(pagination.skip)
        .limit(pagination.limitNum)
        .lean() // Performance optimization - returns plain JS objects
        .exec(),
      Document.countDocuments(filterQuery).setOptions({ _tenantId: req.tenant.tenantId }).exec(),
      Document.aggregate([
        { $match: { ...filterQuery, tenant_id: req.tenant.tenantId } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            types: { $addToSet: '$type' }
          }
        },
        { $sort: { count: -1 } }
      ]).exec()
    ]);

    // Batch populate entity names for all documents (optimized to avoid N+1 queries)
    const documentsWithNames = await batchFetchEntityNames(documents, req.tenant.tenantId);

    // Build category summary
    const documentsByCategory = {};
    categoryStats.forEach(stat => {
      documentsByCategory[stat._id || 'Unknown'] = stat.count;
    });

    // Build response
    const response = buildApiResponse(
      true,
      documentsWithNames,
      null,
      {
        total: totalDocuments,
        page: pagination.pageNum,
        limit: pagination.limitNum
      }
    );

    response.summary = {
      total_documents: totalDocuments,
      documents_by_category: documentsByCategory,
      category_breakdown: categoryStats
    };

    res.status(200).json(response);

  } catch (error) {
    handleError(error, res, 'fetching documents');
  }
});

// GET /api/documents/tags - Get all unique tags from documents
router.get('/tags', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    // Build match query for optional filtering
    let matchQuery = {};

    // CRITICAL: Filter by tenant for multi-tenant data isolation
    // Only show tags from documents belonging to the current tenant
    if (req.tenant && req.tenant.tenantId && !req.tenant.bypassTenant) {
      matchQuery.tenant_id = req.tenant.tenantId;
    }

    if (customer_id) matchQuery['customer.customer_id'] = customer_id;
    if (site_id) matchQuery['location.site.site_id'] = site_id;
    if (building_id) matchQuery['location.building.building_id'] = building_id;

    // Aggregate unique tags
    const pipeline = [
      { $unwind: '$tags.tags' },
      {
        $group: {
          _id: '$tags.tags'
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          tag: '$_id'
        }
      }
    ];

    // Add match stage if filters are provided
    if (Object.keys(matchQuery).length > 0) {
      pipeline.unshift({ $match: matchQuery });
    }

    const tagResults = await Document.aggregate(pipeline);

    // Extract tags as flat array of strings
    const tags = tagResults
      .map(item => item.tag)
      .filter(tag => tag && tag.trim().length > 0); // Filter out empty/null tags

    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document tags',
      error: error.message
    });
  }
});

// GET /api/documents/stats - Get simple document count statistics
router.get('/stats', async (req, res) => {
  try {
    // Get tenant ID from request context (mandatory)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    const filter = {
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    const totalDocuments = await Document.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        totalDocuments
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching document statistics',
      error: error.message
    });
  }
});

// GET /api/documents/:id - Get single document
router.get('/:id', checkModulePermission('documents', 'view'), validateObjectId, async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const document = await Document.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }  // Exclude soft-deleted records
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Populate entity names dynamically
    const names = await fetchEntityNames(document, req.tenant.tenantId);
    const documentWithNames = {
      ...document,
      customer: {
        customer_id: document.customer?.customer_id,
        customer_name: names.customer_name
      },
      location: {
        site: document.location?.site?.site_id ? {
          site_id: document.location.site.site_id,
          site_name: names.site_name
        } : undefined,
        building: document.location?.building?.building_id ? {
          building_id: document.location.building.building_id,
          building_name: names.building_name
        } : undefined,
        floor: document.location?.floor?.floor_id ? {
          floor_id: document.location.floor.floor_id,
          floor_name: names.floor_name
        } : undefined,
        // Multiple assets support
        assets: names.assets && names.assets.length > 0 ? names.assets : 
                (document.location?.assets && document.location.assets.length > 0 ? document.location.assets : undefined),
        // Legacy single asset (for backward compatibility)
        asset: document.location?.asset?.asset_id ? {
          asset_id: document.location.asset.asset_id,
          asset_name: names.asset_name,
          asset_type: names.asset_type
        } : undefined,
        tenant: document.location?.tenant?.tenant_id ? {
          tenant_id: document.location.tenant.tenant_id,
          tenant_name: names.tenant_name
        } : undefined,
        vendor: document.location?.vendor?.vendor_id ? {
          vendor_id: document.location.vendor.vendor_id,
          vendor_name: names.vendor_name
        } : undefined
      }
    };

    res.status(200).json({
      success: true,
      data: documentWithNames
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      error: error.message
    });
  }
});

// Duplicate route removed - see line 2980 for the primary download endpoint with proper validation

// GET /api/documents/:id/preview - Generate presigned URL for document preview
router.get('/:id/preview', validateObjectId, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (!document.file || !document.file.file_meta || !document.file.file_meta.file_key) {
      return res.status(404).json({
        success: false,
        message: 'Document file not found'
      });
    }

    const fileMeta = document.file.file_meta;

    let urlResult;

    // Determine bucket name - use from file_meta if available, otherwise determine from tenant
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      // Bucket name missing - determine from tenant
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
            console.log(`📦 Determined bucket from tenant: ${bucketName}`);
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
            console.log(`📦 Using default bucket (tenant has no bucket): ${bucketName}`);
          }
        } catch (error) {
          console.error('⚠️  Error fetching tenant, using default bucket:', error.message);
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        console.log(`📦 Using default bucket (no tenant): ${bucketName}`);
      }
    }

    // Check if document is in tenant-specific bucket
    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`🔍 Generating preview URL for tenant bucket: ${bucketName}`);
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePreviewUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        fileMeta.file_name,
        fileMeta.file_type,
        3600 // 1 hour expiry
      );
    } else {
      // Use shared bucket
      console.log('🔍 Generating preview URL for shared bucket');
      urlResult = await generatePreviewUrl(
        fileMeta.file_key,
        fileMeta.file_name,
        fileMeta.file_type,
        3600 // 1 hour expiry
      );
    }

    if (!urlResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate preview URL',
        error: urlResult.error
      });
    }

    res.status(200).json({
      success: true,
      preview_url: urlResult.url,
      expires_in: 3600,
      file_name: fileMeta.file_name,
      file_type: fileMeta.file_type,
      file_size: fileMeta.file_size
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating preview URL',
      error: error.message
    });
  }
});

// POST /api/documents - Create new document with file upload
router.post('/', checkModulePermission('documents', 'create'), preserveALSContext(upload.single('file')), validateCreateDocument, async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required'
      });
    }

    // Use validated data from middleware
    const documentData = req.validatedData;

    // Get logged-in user data using helper function
    const { getCurrentUser } = require('../utils/authHelper');
    const currentUser = getCurrentUser(req);

    // Get tenant information for S3 bucket
    const customer = await Customer.findById(documentData.customer_id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get tenant ID from request (set by auth middleware)
    const tenantId = req.user?.tenant_id || req.tenantId;

    console.log('📤 Starting file upload to S3...');
    console.log('📁 File details:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      customer_id: documentData.customer_id,
      tenant_id: tenantId
    });

    let uploadResult;

    // Try to upload to tenant-specific bucket first
    if (tenantId) {
      try {
        // Get tenant information
        const tenant = await Tenant.findById(tenantId);

        if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
          console.log(`📦 Using tenant-specific S3 bucket: ${tenant.s3_bucket_name}`);

          // Upload to tenant-specific bucket
          const tenantS3Service = new TenantS3Service(tenantId);
          uploadResult = await tenantS3Service.uploadFileToTenantBucket(
            req.file,
            tenantId,
            tenant.tenant_name
          );

          console.log(`✅ File uploaded to tenant bucket successfully`);
        } else {
          console.log('⚠️  Tenant bucket not available, falling back to shared bucket');
          uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
        }
      } catch (tenantS3Error) {
        console.error('❌ Tenant bucket upload failed, falling back to shared bucket:', tenantS3Error.message);
        uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
      }
    } else {
      // Fallback to shared bucket if no tenant ID
      console.log('📦 Using shared S3 bucket (no tenant ID)');
      uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
    }

    if (!uploadResult.success) {
      console.error('❌ S3 upload failed:', uploadResult.error);
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: uploadResult.error
      });
    }

    console.log('✅ File uploaded to S3 successfully:', uploadResult.data?.file_meta?.file_key);

    // Build document object
    const documentPayload = {
      name: documentData.name,
      description: documentData.description,
      version: documentData.version || '1.0',
      category: documentData.category,
      type: documentData.type,
      engineering_discipline: documentData.engineering_discipline,

      // File information
      file: uploadResult.data,

      // Version Management (initialize for new documents)
      version_number: documentData.version || '1.0',
      is_current_version: true,
      version_sequence: 1,

      // Tags
      tags: documentData.tags ? { tags: Array.isArray(documentData.tags) ? documentData.tags : [documentData.tags] } : { tags: [] },

      // Customer information (ID only - name populated dynamically)
      customer: {
        customer_id: documentData.customer_id
      },

      // Location associations (IDs only - names populated dynamically)
      location: {},

      // Compliance fields at root level (NOT in metadata wrapper)
      // metadata wrapper is deprecated - fields moved to root for consistency with PUT endpoint
      ...(documentData.regulatory_framework && documentData.regulatory_framework !== 'none' && { regulatory_framework: documentData.regulatory_framework }),
      ...(documentData.certification_number && documentData.certification_number !== 'none' && { certification_number: documentData.certification_number }),
      ...(documentData.compliance_framework && documentData.compliance_framework !== 'none' && { compliance_framework: documentData.compliance_framework }),
      ...(documentData.compliance_status && documentData.compliance_status !== 'none' && { compliance_status: documentData.compliance_status }),
      ...(documentData.issue_date && documentData.issue_date !== 'none' && { issue_date: documentData.issue_date }),
      ...(documentData.expiry_date && documentData.expiry_date !== 'none' && { expiry_date: documentData.expiry_date }),
      // Auto-populate review_date to today if category contains "report" and not provided
      ...((documentData.review_date && documentData.review_date !== 'none')
        ? { review_date: documentData.review_date }
        : (documentData.category && documentData.category.toLowerCase().includes('report'))
          ? { review_date: new Date().toISOString().split('T')[0] }
          : {}
      ),
      ...(documentData.frequency && documentData.frequency !== 'none' && { frequency: documentData.frequency }),

      // Drawing Register information - category restriction removed, allow for all documents
      drawing_info: {
        ...(documentData.date_issued && { date_issued: documentData.date_issued }),
        ...(documentData.drawing_status && { drawing_status: documentData.drawing_status }),
        ...(documentData.prepared_by && { prepared_by: documentData.prepared_by }),
        ...(documentData.drawing_scale && { drawing_scale: documentData.drawing_scale }),
        ...(documentData.approved_by_user && { approved_by_user: documentData.approved_by_user }),
        ...(documentData.related_drawings && { related_drawings: documentData.related_drawings })
      },

      // Access Control
      access_control: {
        access_level: documentData.access_level || 'internal',
        access_users: documentData.access_users || []
      },

      // Tenant ID for multi-tenancy
      tenant_id: req.tenant.tenantId,

      // Audit fields - use provided created_by or set from authenticated user
      created_by: documentData.created_by || (currentUser && currentUser.userEmail ? {
        user_id: currentUser.userId,
        ...(currentUser.userName && { user_name: currentUser.userName }),
        email: currentUser.userEmail
      } : undefined),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add location associations if IDs are provided (IDs only - names populated dynamically)
    if (documentData.site_id) {
      documentPayload.location.site = {
        site_id: documentData.site_id
      };
    }

    if (documentData.building_id) {
      documentPayload.location.building = {
        building_id: documentData.building_id
      };
    }

    if (documentData.floor_id) {
      documentPayload.location.floor = {
        floor_id: documentData.floor_id
      };
    }

    // Handle multiple assets (new feature)
    if (documentData.asset_ids && Array.isArray(documentData.asset_ids) && documentData.asset_ids.length > 0) {
      // Fetch asset details from database
      const assets = await Asset.find({ _id: { $in: documentData.asset_ids.map(id => id.toString()) } });
      documentPayload.location.assets = assets.map(asset => ({
        asset_id: asset._id.toString(),
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category || '' // Allow empty string if no type
      }));
    }
    // Handle single asset (legacy backward compatibility)
    else if (documentData.asset_id) {
      documentPayload.location.asset = {
        asset_id: documentData.asset_id
      };
    }

    if (documentData.tenant_id) {
      documentPayload.location.tenant = {
        tenant_id: documentData.tenant_id
      };
    }

    if (documentData.vendor_id) {
      documentPayload.location.vendor = {
        vendor_id: documentData.vendor_id
      };
    }

    // Add approval configuration if provided
    if (documentData.approval_config) {
      documentPayload.approval_config = {
        enabled: documentData.approval_config.enabled || false,
        status: documentData.approval_config.status || 'Draft',
        approvers: documentData.approval_config.approvers || [],
        approval_history: []
      };
    }

    // Create document and set audit context
    const document = new Document(documentPayload);
    document.$setAuditContext(req, 'create');
    await document.save();

    // Set document_group_id to the document's own ID after creation
    document.document_group_id = document._id.toString();
    await document.save();

    // Populate entity names for response
    const documentLean = document.toObject();
    const names = await fetchEntityNames(documentLean, req.tenant.tenantId);
    const documentWithNames = {
      ...documentLean,
      customer: {
        customer_id: documentLean.customer?.customer_id,
        customer_name: names.customer_name
      },
      location: {
        site: documentLean.location?.site?.site_id ? {
          site_id: documentLean.location.site.site_id,
          site_name: names.site_name
        } : undefined,
        building: documentLean.location?.building?.building_id ? {
          building_id: documentLean.location.building.building_id,
          building_name: names.building_name
        } : undefined,
        floor: documentLean.location?.floor?.floor_id ? {
          floor_id: documentLean.location.floor.floor_id,
          floor_name: names.floor_name
        } : undefined,
        // Multiple assets support
        assets: names.assets && names.assets.length > 0 ? names.assets : 
                (documentLean.location?.assets && documentLean.location.assets.length > 0 ? documentLean.location.assets : undefined),
        // Legacy single asset (for backward compatibility)
        asset: documentLean.location?.asset?.asset_id ? {
          asset_id: documentLean.location.asset.asset_id,
          asset_name: names.asset_name,
          asset_type: names.asset_type
        } : undefined,
        tenant: documentLean.location?.tenant?.tenant_id ? {
          tenant_id: documentLean.location.tenant.tenant_id,
          tenant_name: names.tenant_name
        } : undefined,
        vendor: documentLean.location?.vendor?.vendor_id ? {
          vendor_id: documentLean.location.vendor.vendor_id,
          vendor_name: names.vendor_name
        } : undefined
      }
    };

    // Send approval emails asynchronously (don't wait for completion)
    if (documentData.approval_config?.enabled && documentData.approval_config.approvers?.length > 0) {
      const documentDetails = {
        name: document.name || document.file?.file_meta?.file_name || 'Unnamed Document',
        category: document.category,
        type: document.type,
        status: documentData.approval_config.status || 'Pending Approval',
        uploadedBy: documentData.created_by?.user_name || documentData.created_by?.email || 'Unknown',
        uploadedDate: new Date(),
        description: document.description
      };

      // Non-blocking: Send emails to all approvers after response
      documentData.approval_config.approvers.forEach((approver) => {
        if (approver.user_email) {
          sendEmailAsync(
            () => emailService.sendDocumentAssignment({
              to: approver.user_email,
              documentId: document._id.toString(),
              approverName: approver.user_name || approver.user_email,
              documentDetails
            }),
            `document_assignment_email_${approver.user_email}`
          );
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: documentWithNames
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: 'Error creating document',
      error: error.message
    });
  }
});

// PUT /api/documents/bulk-update - Bulk update multiple documents
router.put('/bulk-update', requireIfMatch, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { document_ids, updates, versions } = req.body; // versions is optional map: { docId: version }

    // Validate request body
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'document_ids array is required and must not be empty'
      });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'updates object is required and must not be empty'
      });
    }

    // Validate all document IDs are valid ObjectIds
    const invalidIds = document_ids.filter(id => !id || !id.match(/^[0-9a-fA-F]{24}$/));
    if (invalidIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format',
        invalid_ids: invalidIds
      });
    }

    // Verify tenant context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    // Fetch entity names for the updates
    const entityNames = await fetchEntityNames(updates, req.tenant.tenantId);

    // Build update object for all fields
    const updateObject = {};

    // Location fields
    if (updates.site_id) {
      updateObject['location.site'] = {
        site_id: updates.site_id,
        ...(entityNames.site_name && { site_name: entityNames.site_name })
      };
    }

    if (updates.building_id) {
      updateObject['location.building'] = {
        building_id: updates.building_id,
        ...(entityNames.building_name && { building_name: entityNames.building_name })
      };
    }

    if (updates.floor_id) {
      updateObject['location.floor'] = {
        floor_id: updates.floor_id,
        ...(entityNames.floor_name && { floor_name: entityNames.floor_name })
      };
    }

    // Handle multiple assets (new feature)
    if (updates.asset_ids && Array.isArray(updates.asset_ids) && updates.asset_ids.length > 0) {
      // Fetch asset details from database
      const assets = await Asset.find({ _id: { $in: updates.asset_ids.map(id => id.toString()) } }).session(session);
      updateObject['location.assets'] = assets.map(asset => ({
        asset_id: asset._id.toString(),
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category
      }));
      // Clear legacy single asset field when using multiple assets
      updateObject['location.asset'] = undefined;
    }
    // Handle single asset (legacy backward compatibility)
    else if (updates.asset_id) {
      updateObject['location.asset'] = {
        asset_id: updates.asset_id,
        ...(entityNames.asset_name && { asset_name: entityNames.asset_name }),
        ...(entityNames.asset_type && { asset_type: entityNames.asset_type })
      };
    }

    // handle building tenant id update
    if (updates.tenant_id) {
      updateObject['location.tenant'] = {
        tenant_id: updates.tenant_id,
        ...(entityNames.tenant_name && { tenant_name: entityNames.tenant_name })
      };
    }

    if (updates.vendor_id) {
      updateObject['location.vendor'] = {
        vendor_id: updates.vendor_id,
        ...(entityNames.vendor_name && { vendor_name: entityNames.vendor_name })
      };
    }

    // Customer
    if (updates.customer_id) {
      updateObject['customer.customer_id'] = updates.customer_id;
      if (entityNames.customer_name) {
        updateObject['customer.customer_name'] = entityNames.customer_name;
      }
    }

    // Document properties
    if (updates.tags && Array.isArray(updates.tags)) {
      updateObject['tags.tags'] = updates.tags;
    }

    if (updates.status) {
      updateObject.status = updates.status;
    }

    if (updates.category) {
      updateObject.category = updates.category;
    }

    if (updates.type) {
      updateObject.type = updates.type;
    }

    if (updates.engineering_discipline) {
      updateObject.engineering_discipline = updates.engineering_discipline;
    }

    // Add updated_at timestamp
    updateObject.updated_at = new Date().toISOString();

    // Perform individual updates with version checking (prevents lost updates)
    const updateResults = [];
    const conflicts = [];
    
    for (const docId of document_ids) {
      const clientVersion = versions?.[docId] ?? req.clientVersion ?? req.body.__v;
      
      // If versions provided, check each document's version
      const query = { 
        _id: docId,
        tenant_id: tenantId
      };
      
      if (clientVersion !== undefined && versions) {
        query.__v = clientVersion;
      }
      
      const result = await Document.findOneAndUpdate(
        query,
        {
          $set: updateObject,
          $inc: { __v: 1 }
        },
        { 
          new: true,
          session,
          runValidators: true
        }
      );
      
      if (!result) {
        if (clientVersion !== undefined) {
          // Version conflict or not found
          const existingDoc = await Document.findById(docId).session(session);
          if (existingDoc) {
            conflicts.push({
              document_id: docId,
              clientVersion,
              currentVersion: existingDoc.__v,
              message: 'Version conflict'
            });
          } else {
            conflicts.push({
              document_id: docId,
              message: 'Document not found or access denied'
            });
          }
        } else {
          conflicts.push({
            document_id: docId,
            message: 'Document not found or access denied'
          });
        }
      } else {
        updateResults.push(docId);
      }
    }

    // If any conflicts, abort transaction
    if (conflicts.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: 'Some documents had version conflicts or were not found',
        conflicts,
        updated_count: updateResults.length,
        failed_count: conflicts.length
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Documents updated successfully',
      updated_count: updateResults.length,
      document_ids: updateResults
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: 'Error updating documents',
      error: error.message
    });
  }
});

// PUT /api/documents/:id - Update document
router.put('/:id', checkModulePermission('documents', 'edit'), requireIfMatch, validateObjectId, async (req, res) => {

  // Fields to store 
 /* {
    // Basic Information
    name: string,
    category: string,
    type: string,
    description?: string,

    // Customer (ROOT LEVEL - needs restructuring)
    customer_id: string,
    customer_name: string,

    // Tags (ALREADY NESTED)
    tags: { tags: string[] },

    // Location (NESTED OBJECT)
    location: {
      site?: { site_id, site_name },
      building?: { building_id, building_name },
      floor?: { floor_id, floor_name },
      tenant?: { tenant_id, tenant_name }, // building tenant id
      assets?: [{ asset_id, asset_name, asset_type }]
    },

    // Compliance & Regulatory (ROOT LEVEL)
    engineering_discipline?: string,
    regulatory_framework?: string,
    certification_number?: string,
    compliance_framework?: string,
    compliance_status?: string,
    issue_date?: string,  // ISO format
    expiry_date?: string,  // ISO format
    review_date?: string,  // ISO format
    frequency?: string,

    // Drawing Register Fields (ROOT LEVEL)
    date_issued?: string,  // ISO format
    drawing_status?: string,
    prepared_by?: string,
    drawing_scale?: string,
    approved_by_user?: string,
    related_drawings?: [{ document_id, document_name }],

    // Access Control (ROOT LEVEL)
    access_level?: string,
    access_users?: string[],

    // Approval Configuration (NESTED OBJECT)
    approval_config: {
      enabled: boolean,
      status: string,
      approvers: [{ user_id, user_name, user_email }]
    },

    // File Metadata (NESTED OBJECT)
    file: {
      ...existing_file_data,
      file_meta: {
        ...existing_file_meta,
        version: string
      }
    }
  }
  */


  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    // Get old document to compare changes - scoped to tenant
    const oldDocument = await Document.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId }).lean();

    const updateData = { ...req.body };
    updateData.updated_at = new Date().toISOString();

    // Prevent tenant_id from being changed
    delete updateData.tenant_id;

    // Remove metadata wrapper - fields are now at root level
    delete updateData.metadata;

    // Handle customer fields - convert from root level to nested structure
    if (updateData.customer_id) {
      if (!updateData.customer) {
        updateData.customer = {};
      }
      updateData.customer.customer_id = updateData.customer_id;
      delete updateData.customer_id;
    }
    if (updateData.customer_name) {
      if (!updateData.customer) {
        updateData.customer = {};
      }
      updateData.customer.customer_name = updateData.customer_name;
      delete updateData.customer_name;
    }

    // Clean root-level compliance fields: remove "none" values and empty fields
    const rootFieldsToClean = [
      'engineering_discipline', 'regulatory_framework', 'certification_number',
      'compliance_framework', 'compliance_status', 'issue_date', 'expiry_date', 'frequency'
    ];
    rootFieldsToClean.forEach(field => {
      if (updateData[field] === 'none' || updateData[field] === '') {
        delete updateData[field];
      }
    });

    // Clean drawing_info: remove "none" values and empty fields
    if (updateData.drawing_info) {
      const cleanedDrawingInfo = {};
      Object.keys(updateData.drawing_info).forEach(key => {
        const value = updateData.drawing_info[key];
        if (value && value !== 'none' && value !== '') {
          cleanedDrawingInfo[key] = value;
        }
      });
      updateData.drawing_info = Object.keys(cleanedDrawingInfo).length > 0 ? cleanedDrawingInfo : {};
    }

    // Clean access_control: remove "none" values and empty fields
    if (updateData.access_control) {
      const cleanedAccessControl = {};
      Object.keys(updateData.access_control).forEach(key => {
        const value = updateData.access_control[key];
        if (value && value !== 'none' && value !== '') {
          cleanedAccessControl[key] = value;
        }
      });
      updateData.access_control = Object.keys(cleanedAccessControl).length > 0 ? cleanedAccessControl : {};
    }

    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to update document'
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

    // Load document (tenant-scoped automatically via plugin, but verify manually too)
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or you do not have permission to update it'
      });
    }

    // Verify tenant ownership
    if (document.tenant_id && document.tenant_id.toString() !== tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Document belongs to a different tenant'
      });
    }

    // Check version match for optimistic concurrency control
    if (document.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: req.params.id
      });
    }

    // Use atomic findOneAndUpdate instead of Object.assign to prevent lost updates
    // Build atomic update object with allowed fields only
    const allowedFields = [
      'name', 'description', 'category', 'type', 'engineering_discipline',
      'regulatory_framework', 'certification_number', 'compliance_framework',
      'compliance_status', 'issue_date', 'expiry_date', 'review_date', 'frequency',
      'status', 'tags', 'customer', 'location', 'drawing_info', 'access_control',
      'approval_config', 'file', 'version_number', 'version', 'is_current_version'
    ];
    
    // Filter out undefined/null and non-allowed fields to preserve existing data
    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });
    
    // Add updated_at
    atomicUpdate.updated_at = new Date().toISOString();
    
    // Perform atomic update with version check
    const result = await Document.findOneAndUpdate(
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
        currentVersion: document.__v,
        resource: 'Document',
        id: req.params.id
      });
    }
    
    // Update document reference for entity name population
    const documentLean = result.toObject();

    // Populate entity names dynamically
    const names = await fetchEntityNames(documentLean, req.tenant.tenantId);
    const documentWithNames = {
      ...documentLean,
      customer: {
        customer_id: documentLean.customer?.customer_id,
        customer_name: names.customer_name
      },
      location: {
        site: documentLean.location?.site?.site_id ? {
          site_id: documentLean.location.site.site_id,
          site_name: names.site_name
        } : undefined,
        building: documentLean.location?.building?.building_id ? {
          building_id: documentLean.location.building.building_id,
          building_name: names.building_name
        } : undefined,
        floor: documentLean.location?.floor?.floor_id ? {
          floor_id: documentLean.location.floor.floor_id,
          floor_name: names.floor_name
        } : undefined,
        // Multiple assets support
        assets: names.assets && names.assets.length > 0 ? names.assets : 
                (documentLean.location?.assets && documentLean.location.assets.length > 0 ? documentLean.location.assets : undefined),
        // Legacy single asset (for backward compatibility)
        asset: documentLean.location?.asset?.asset_id ? {
          asset_id: documentLean.location.asset.asset_id,
          asset_name: names.asset_name,
          asset_type: names.asset_type
        } : undefined,
         // building tenant id
        tenant: documentLean.location?.tenant?.tenant_id ? {
          tenant_id: documentLean.location.tenant.tenant_id,
          tenant_name: names.tenant_name
        } : undefined,
        vendor: documentLean.location?.vendor?.vendor_id ? {
          vendor_id: documentLean.location.vendor.vendor_id,
          vendor_name: names.vendor_name
        } : undefined
      }
    };

    // Send notifications for status change or approver assignment (async, don't block response)
    setImmediate(async () => {
      try {
        const userId = req.user?.userId || req.user?.sub || 'unknown';
        const userName = req.user?.name || req.user?.email || 'Unknown User';

        // Check if main document status changed
        const mainStatusChanged = oldDocument && document.status && oldDocument.status !== document.status;

        // Check if approval status changed
        const approvalStatusChanged = oldDocument?.approval_config?.status !== document?.approval_config?.status;

        console.log('🔍 Status change detection:', {
          mainStatus: { old: oldDocument?.status, new: document.status, changed: mainStatusChanged },
          approvalStatus: { old: oldDocument?.approval_config?.status, new: document?.approval_config?.status, changed: approvalStatusChanged }
        });

        // Send notification if either status changed
        if (mainStatusChanged || approvalStatusChanged) {
          const oldStatus = mainStatusChanged ? oldDocument.status : oldDocument?.approval_config?.status;
          const newStatus = mainStatusChanged ? document.status : document?.approval_config?.status;
          const statusType = mainStatusChanged ? 'main status' : 'approval status';

          console.log(`📝 Document ${statusType} changed:`, {
            oldStatus,
            newStatus,
            documentId: document._id,
            tenantId: document.tenant_id
          });

          const recipients = [];

          // Add document creator
          if (document.created_by) {
            recipients.push({
              user_id: document.created_by,
              user_email: document.created_by
            });
          }

          // Add approvers
          if (document.approval_config && document.approval_config.approvers) {
            document.approval_config.approvers.forEach(approver => {
              if (approver.user_email && approver.user_email !== userId) {
                recipients.push({
                  user_id: approver.user_id,
                  user_email: approver.user_email
                });
              }
            });
          }

          // Remove duplicates
          const uniqueRecipients = recipients.filter((recipient, index, self) =>
            index === self.findIndex(r => r.user_email === recipient.user_email)
          );

          console.log('📬 Status change notification recipients:', {
            count: uniqueRecipients.length,
            emails: uniqueRecipients.map(r => r.user_email)
          });

          if (uniqueRecipients.length > 0) {
            console.log(`✅ Sending ${statusType} change notification to ${uniqueRecipients.length} recipients...`);
            // Non-blocking: Send notifications after response
            sendNotificationAsync(
              () => notificationService.notifyDocumentStatusChanged(
                document,
                oldStatus,
                newStatus,
                uniqueRecipients,
                {
                  user_id: userId,
                  user_name: userName,
                  user_email: req.user?.email || userId
                },
                document.tenant_id  // ✅ ADD tenant_id for multi-tenancy
              ),
              'document_status_changed'
            );
          } else {
            console.log(`ℹ️  No recipients for ${statusType} change notification`);
          }
        } else {
          console.log('ℹ️  No status changes detected');
        }

        // Send notification to ALL approvers (not just new ones)
        const allApprovers = document?.approval_config?.approvers || [];

        console.log('📋 Notifying all approvers:', {
          approversCount: allApprovers.length,
          emails: allApprovers.map(a => a.user_email),
          tenantId: document.tenant_id
        });

        if (allApprovers.length > 0) {
          console.log('✅ Sending notification to all approvers...');
          // Non-blocking: Send notifications after response
          sendNotificationAsync(
            () => notificationService.notifyDocumentApproversAssigned(
              document,
              allApprovers.map(approver => ({
                user_id: approver.user_id,
                user_email: approver.user_email
              })),
              {
                user_id: userId,
                user_name: userName,
                user_email: req.user?.email || userId
              },
              document.tenant_id  // ✅ ADD tenant_id for multi-tenancy
            ),
            'document_approvers_assigned'
          );
        } else {
          console.log('ℹ️  No approvers to notify');
        }
      } catch (notifError) {
        console.error('❌ Failed to send document update notifications:', notifError);
        console.error('Error details:', notifError.stack);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: documentWithNames
    });
  } catch (error) {
    // Handle Mongoose VersionError (shouldn't happen with manual check above, but safety net)
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Document',
        id: req.params.id
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating document',
      error: error.message
    });
  }
});

// DELETE /api/documents/bulk - Bulk delete documents
router.delete('/bulk', checkModulePermission('documents', 'delete'), async (req, res) => {
  try {
    const { document_ids } = req.body;

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'document_ids array is required and must not be empty'
      });
    }

    const results = {
      success: [],
      failed: [],
      s3_deletions: {
        success: [],
        failed: []
      }
    };

    // Process each document
    for (const docId of document_ids) {
      try {
        const document = await Document.findById(docId);

        if (!document) {
          results.failed.push({
            id: docId,
            reason: 'Document not found'
          });
          continue;
        }

        // Delete file from S3 if exists
        if (document.file && document.file.file_meta && document.file.file_meta.file_key) {
          const deleteResult = await deleteFileFromS3(document.file.file_meta.file_key);
          if (deleteResult.success) {
            results.s3_deletions.success.push(document.file.file_meta.file_key);
          } else {
            results.s3_deletions.failed.push({
              key: document.file.file_meta.file_key,
              reason: deleteResult.message || 'S3 deletion failed'
            });
          }
        }

        // Delete document from database
        await Document.findByIdAndDelete(docId);
        results.success.push({
          id: docId,
          name: document.name
        });

      } catch (error) {
        results.failed.push({
          id: docId,
          reason: error.message
        });
      }
    }

    const totalRequested = document_ids.length;
    const totalDeleted = results.success.length;
    const totalFailed = results.failed.length;

    res.status(200).json({
      success: true,
      message: `Bulk delete completed: ${totalDeleted} of ${totalRequested} documents deleted`,
      data: {
        total_requested: totalRequested,
        deleted: totalDeleted,
        failed: totalFailed,
        results: results
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error performing bulk delete',
      error: error.message
    });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', checkModulePermission('documents', 'delete'), async (req, res) => {
  try {
    // Get tenant_id from authenticated user's context
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required to delete document'
      });
    }

    // Find document ONLY if belongs to user's tenant
    const document = await Document.findOne({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this resource
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or you do not have permission to delete it'
      });
    }

    // Check if already deleted
    if (document.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Document already deleted'
      });
    }

    // Soft delete document (S3 files kept for now, will be purged later)
    await Document.findByIdAndUpdate(req.params.id, { is_delete: true });

    // TODO: archieve all s3 files for this document

    // write code here...

    // Log audit for document deletion
    await logDelete({ module: 'document', resourceName: document.name || 'Document', req, moduleId: document._id, resource: document.toObject() });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
      error: error.message
    });
  }
});

// GET /api/documents/by-type/:type - Get documents by type with search
router.get('/by-type/:type', async (req, res) => {
  try {
    const { search, page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    // Build filter query
    let filterQuery = { type: req.params.type };

    // Add search capability
    if (search) {
      filterQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'tags.tags': { $regex: search, $options: 'i' } },
        { 'customer.customer_name': { $regex: search, $options: 'i' } },
        { 'location.site.site_name': { $regex: search, $options: 'i' } },
        { 'location.building.building_name': { $regex: search, $options: 'i' } },
        { 'location.floor.floor_name': { $regex: search, $options: 'i' } },
        { 'file.file_meta.file_name': { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const documents = await Document.find(filterQuery)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Performance optimization

    const totalDocuments = await Document.countDocuments(filterQuery);

    const summary = {
      total_documents: totalDocuments,
      by_category: {}
    };

    // Group by category (optimized aggregation)
    const categoryStats = await Document.aggregate([
      { $match: filterQuery },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    categoryStats.forEach(stat => {
      summary.by_category[stat._id || 'Unknown'] = stat.count;
    });

    res.status(200).json({
      success: true,
      count: documents.length,
      total: totalDocuments,
      page: pageNum,
      pages: Math.ceil(totalDocuments / limitNum),
      document_type: req.params.type,
      summary,
      data: documents
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching documents by type',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/documents/by-building/:buildingId - Get documents by building with search
router.get('/by-building/:buildingId', async (req, res) => {
  try {
    const { search, page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    // Validate building ID format
    if (!req.params.buildingId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid building ID format'
      });
    }

    // Build filter query
    let filterQuery = {
      'location.building.building_id': req.params.buildingId
    };

    // Add search capability
    if (search) {
      filterQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'tags.tags': { $regex: search, $options: 'i' } },
        { 'customer.customer_name': { $regex: search, $options: 'i' } },
        { 'location.site.site_name': { $regex: search, $options: 'i' } },
        { 'location.floor.floor_name': { $regex: search, $options: 'i' } },
        { 'location.tenant.tenant_name': { $regex: search, $options: 'i' } },
        { 'file.file_meta.file_name': { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Use snapshot isolation for consistent reads
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    
    try {
      const [documents, totalDocuments, categoryStats] = await Promise.all([
        Document.find(filterQuery)
          .session(session)
          .readConcern('snapshot')
          .sort(sortObj)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Document.countDocuments(filterQuery)
          .session(session)
          .readConcern('snapshot'),
        Document.aggregate([
          { $match: filterQuery },
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ]).session(session).readConcern('snapshot')
      ]);
      
      const summary = {
        total_documents: totalDocuments,
        by_category: {}
      };

      categoryStats.forEach(stat => {
        summary.by_category[stat._id || 'Unknown'] = stat.count;
      });

      res.status(200).json({
        success: true,
        count: documents.length,
        total: totalDocuments,
        page: pageNum,
        pages: Math.ceil(totalDocuments / limitNum),
        building_id: req.params.buildingId,
        summary,
        data: documents
      });
    } catch (error) {
      await session.endSession();
      res.status(500).json({
        success: false,
        message: 'Error fetching documents by building',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by building',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/documents/summary/stats - Get document summary statistics
router.get('/summary/stats', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery['customer.customer_id'] = customer_id;
    if (site_id) matchQuery['location.site.site_id'] = site_id;
    if (building_id) matchQuery['location.building.building_id'] = building_id;

    // Use read concern snapshot for consistent aggregations (prevents dirty reads)
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    
    try {
      const stats = await Document.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            byCategory: {
              $push: { category: '$category', type: '$type' }
            }
          }
        }
      ]).session(session).readConcern('snapshot');
      
      const result = stats[0] || {
        totalDocuments: 0,
        byCategory: []
      };

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      await session.endSession();
      res.status(500).json({
        success: false,
        message: 'Error fetching document statistics',
        error: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document statistics',
      error: error.message
    });
  }
});

// GET /api/storage/stats - Get document storage statistics
router.get('/storage/stats', async (req, res) => {
  try {
    // Get tenant ID from request context (mandatory)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');

    // Build aggregation pipeline with mandatory tenant filter
    const matchStage = {
      'file.file_meta.file_size': { $exists: true, $ne: null },
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    // Aggregate total file size and count documents with files
    const sizeAggregation = await Document.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: null,
          totalSize: { $sum: '$file.file_meta.file_size' },
          fileCount: { $sum: 1 }
        }
      }
    ]);

    const totalSize = sizeAggregation.length > 0 ? sizeAggregation[0].totalSize : 0;
    const fileCount = sizeAggregation.length > 0 ? sizeAggregation[0].fileCount : 0;

    // Convert bytes to MB and GB
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

    // Count total document records with tenant filter
    const options = tenantId ? { _tenantId: tenantId } : {};
    const totalRecords = await Document.countDocuments({}, options);

    res.status(200).json({
      success: true,
      data: {
        totalSizeBytes: totalSize,
        totalSizeMB: parseFloat(totalSizeMB),
        totalSizeGB: parseFloat(totalSizeGB),
        displaySize: displaySize,
        totalRecords: totalRecords,
        documentsWithFiles: fileCount,
        documentsWithoutFiles: totalRecords - fileCount
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching storage statistics',
      error: error.message
    });
  }
});

// GET /api/documents/by-category - Group documents by category
router.get('/by-category', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery['customer.customer_id'] = customer_id;
    if (site_id) matchQuery['location.site.site_id'] = site_id;
    if (building_id) matchQuery['location.building.building_id'] = building_id;

    // Use read concern snapshot for consistent category statistics (prevents dirty reads)
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    
    try {
      const categoryStats = await Document.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            types: { $addToSet: '$type' }
          }
        },
        { $sort: { count: -1 } }
      ]).session(session).readConcern('snapshot');
      
      res.status(200).json({
        success: true,
        data: categoryStats
      });
    } catch (error) {
      await session.endSession();
      res.status(500).json({
        success: false,
        message: 'Error fetching category statistics',
        error: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category statistics',
      error: error.message
    });
  }
});

// GET /api/documents/options/entities - Get dropdown options for customers, sites, buildings, etc.
router.get('/options/entities', async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    const options = {
      customers: [],
      sites: [],
      buildings: [],
      floors: [],
      tenants: []
    };

    // Get customers
    const customers = await Customer.find({}, '_id organisation.organisation_name company_profile.organisation_name')
      .limit(100)
      .lean();

    options.customers = customers.map(customer => ({
      id: customer._id.toString(),
      name: customer.organisation?.organisation_name ||
            customer.company_profile?.organisation_name ||
            'Unknown Customer'
    }));

    // Get sites (filtered by customer if provided)
    const siteFilter = customer_id ? { customer_id } : {};
    const sites = await Site.find(siteFilter, '_id site_name customer_id')
      .limit(100)
      .lean();

    options.sites = sites.map(site => ({
      id: site._id.toString(),
      name: site.site_name,
      customer_id: site.customer_id?.toString()
    }));

    // Get buildings (filtered by site if provided)
    const buildingFilter = site_id ? { site_id } : {};
    const buildings = await Building.find(buildingFilter, '_id building_name site_id')
      .limit(100)
      .lean();

    options.buildings = buildings.map(building => ({
      id: building._id.toString(),
      name: building.building_name,
      site_id: building.site_id?.toString()
    }));

    // Get floors (filtered by building if provided)
    const floorFilter = building_id ? { building_id } : {};
    const floors = await Floor.find(floorFilter, '_id floor_name building_id')
      .sort({ floor_number: 1 })
      .limit(100)
      .lean();

    options.floors = floors.map(floor => ({
      id: floor._id.toString(),
      name: floor.floor_name,
      building_id: floor.building_id?.toString()
    }));

    // Get tenants (filtered by building if provided)
    const tenantFilter = building_id ? { building_id } : {};
    const tenants = await BuildingTenant.find(tenantFilter, '_id tenant_name building_id')
      .limit(100)
      .lean();

    options.tenants = tenants.map(tenant => ({
      id: tenant._id.toString(),
      name: tenant.tenant_name,
      building_id: tenant.building_id?.toString()
    }));

    res.status(200).json({
      success: true,
      data: options
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching entity options',
      error: error.message
    });
  }
});

// ==================== APPROVAL WORKFLOW ENDPOINTS ====================

const ApprovalHistory = require('../models/ApprovalHistory');
const {
  validateRequestApproval,
  validateApprove,
  validateReject,
  validateRevokeApproval
} = require('../middleware/approvalValidation');

// POST /api/documents/:id/request-approval - Request approval for a document
router.post('/:id/request-approval', validateObjectId, validateRequestApproval, requireIfMatch, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { assigned_to, assigned_to_name, requested_by, requested_by_name, comments } = req.body;

    // Validate required fields
    if (!assigned_to) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'assigned_to is required'
      });
    }

    if (!requested_by) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'requested_by is required'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include version for concurrent safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Find the document with version check
    const document = await Document.findById(id).session(session);
    if (!document) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check version match
    if (document.__v !== clientVersion) {
      await session.abortTransaction();
      session.endSession();
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Store previous status for history
    const previousStatus = document.approval_status;

    // Atomic update with transaction
    const result = await Document.findOneAndUpdate(
      { 
        _id: id,
        __v: clientVersion
      },
      {
        $set: {
          approval_required: true,
          approval_status: 'Pending',
          approved_by: assigned_to,
          updated_at: new Date().toISOString()
        },
        $inc: { __v: 1 }
      },
      { 
        new: true,
        session,
        runValidators: true
      }
    );

    if (!result) {
      await session.abortTransaction();
      session.endSession();
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Create approval history record in transaction
    const approvalHistory = new ApprovalHistory({
      document_id: result._id,
      document_name: result.name,
      action: 'requested',
      previous_status: previousStatus,
      new_status: 'Pending',
      performed_by: requested_by,
      performed_by_name: requested_by_name,
      assigned_to: assigned_to,
      assigned_to_name: assigned_to_name,
      comments: comments || 'Approval requested',
      metadata: {
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }
    });

    await approvalHistory.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Approval request submitted successfully',
      data: {
        document_id: result._id,
        approval_status: result.approval_status,
        approved_by: result.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: 'Error requesting approval',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/approve - Approve a document
router.put('/:id/approve', validateObjectId, validateApprove, requireIfMatch, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { approved_by, approved_by_name, comments } = req.body;

    // Validate required fields
    if (!approved_by) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'approved_by is required'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include version for concurrent safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Find the document with version check
    const document = await Document.findById(id).session(session);
    if (!document) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check version match
    if (document.__v !== clientVersion) {
      await session.abortTransaction();
      session.endSession();
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Check if approval is required and not already approved
    if (!document.approval_required) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Document does not require approval'
      });
    }

    if (document.approval_status === 'Approved') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Document already approved'
      });
    }

    // Store previous status for history
    const previousStatus = document.approval_status;

    // Atomic update with conditional check (prevents duplicate approvals)
    const result = await Document.findOneAndUpdate(
      { 
        _id: id,
        __v: clientVersion,
        approval_status: { $ne: 'Approved' }  // Prevent overwriting existing approval
      },
      {
        $set: {
          approval_status: 'Approved',
          approved_by: approved_by,
          status: 'Approved',
          updated_at: new Date().toISOString()
        },
        $inc: { __v: 1 }
      },
      { 
        new: true,
        session,
        runValidators: true
      }
    );

    if (!result) {
      await session.abortTransaction();
      session.endSession();
      // Re-check document to provide better error message
      const currentDoc = await Document.findById(id);
      if (currentDoc && currentDoc.approval_status === 'Approved') {
        return res.status(409).json({
          success: false,
          message: 'Document was already approved by another user',
          code: 'ALREADY_APPROVED',
          details: {
            currentVersion: currentDoc.__v,
            approval_status: currentDoc.approval_status
          }
        });
      }
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Create approval history record in transaction
    const approvalHistory = new ApprovalHistory({
      document_id: result._id,
      document_name: result.name,
      action: 'approved',
      previous_status: previousStatus,
      new_status: 'Approved',
      performed_by: approved_by,
      performed_by_name: approved_by_name,
      comments: comments || 'Document approved',
      metadata: {
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }
    });

    await approvalHistory.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    // Send notifications (async, don't block response)
    setImmediate(async () => {
      try {
        const recipients = [];

        // Add document creator if available
        if (result.created_by) {
          recipients.push({
            user_id: result.created_by,
            user_email: result.created_by // Assuming email, might need to fetch from User model
          });
        }

        // Add all approvers from approval_config
        if (result.approval_config && result.approval_config.approvers) {
          result.approval_config.approvers.forEach(approver => {
            if (approver.user_email) {
              recipients.push({
                user_id: approver.user_id,
                user_email: approver.user_email
              });
            }
          });
        }

        // Remove duplicates and the approver who just approved
        const uniqueRecipients = recipients.filter((recipient, index, self) =>
          recipient.user_email !== (approved_by_name || approved_by) &&
          index === self.findIndex(r => r.user_email === recipient.user_email)
        );

        if (uniqueRecipients.length > 0) {
          // Non-blocking: Send notifications after response
          sendNotificationAsync(
            () => notificationService.notifyDocumentApprovalStatusChanged(
              result,
              'Approved',
              uniqueRecipients,
              {
                user_id: approved_by,
                user_name: approved_by_name || approved_by,
                user_email: approved_by_name || approved_by
              },
              result.tenant_id  // ✅ ADD tenant_id for multi-tenancy
            ),
            'document_approved'
          );
        }
      } catch (notifError) {
        console.error('Failed to send approval notifications:', notifError);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Document approved successfully',
      data: {
        document_id: result._id,
        approval_status: result.approval_status,
        status: result.status,
        approved_by: result.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: 'Error approving document',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/reject - Reject a document
router.put('/:id/reject', validateObjectId, validateReject, requireIfMatch, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { rejected_by, rejected_by_name, comments } = req.body;

    // Validate required fields
    if (!rejected_by) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'rejected_by is required'
      });
    }

    if (!comments) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'comments are required when rejecting a document'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include version for concurrent safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Find the document with version check
    const document = await Document.findById(id).session(session);
    if (!document) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check version match
    if (document.__v !== clientVersion) {
      await session.abortTransaction();
      session.endSession();
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Check if approval is required and not already approved/rejected
    if (!document.approval_required) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Document does not require approval'
      });
    }

    if (document.approval_status === 'Approved') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot reject an already approved document'
      });
    }

    // Store previous status for history
    const previousStatus = document.approval_status;

    // Atomic update with conditional check
    const result = await Document.findOneAndUpdate(
      { 
        _id: id,
        __v: clientVersion,
        approval_status: { $ne: 'Approved' }  // Prevent rejecting already approved docs
      },
      {
        $set: {
          approval_status: 'Rejected',
          approved_by: rejected_by,
          status: 'Rejected',
          updated_at: new Date().toISOString()
        },
        $inc: { __v: 1 }
      },
      { 
        new: true,
        session,
        runValidators: true
      }
    );

    if (!result) {
      await session.abortTransaction();
      session.endSession();
      // Re-check document to provide better error message
      const currentDoc = await Document.findById(id);
      if (currentDoc && currentDoc.approval_status === 'Approved') {
        return res.status(409).json({
          success: false,
          message: 'Document was approved by another user and cannot be rejected',
          code: 'ALREADY_APPROVED',
          details: {
            currentVersion: currentDoc.__v,
            approval_status: currentDoc.approval_status
          }
        });
      }
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Create approval history record in transaction
    const approvalHistory = new ApprovalHistory({
      document_id: result._id,
      document_name: result.name,
      action: 'rejected',
      previous_status: previousStatus,
      new_status: 'Rejected',
      performed_by: rejected_by,
      performed_by_name: rejected_by_name,
      comments: comments,
      metadata: {
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }
    });

    await approvalHistory.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    // Send notifications (async, don't block response)
    setImmediate(async () => {
      try {
        const recipients = [];

        // Add document creator if available
        if (result.created_by) {
          recipients.push({
            user_id: result.created_by,
            user_email: result.created_by // Assuming email, might need to fetch from User model
          });
        }

        // Add all approvers from approval_config
        if (result.approval_config && result.approval_config.approvers) {
          result.approval_config.approvers.forEach(approver => {
            if (approver.user_email) {
              recipients.push({
                user_id: approver.user_id,
                user_email: approver.user_email
              });
            }
          });
        }

        // Remove duplicates and the rejecter
        const uniqueRecipients = recipients.filter((recipient, index, self) =>
          recipient.user_email !== (rejected_by_name || rejected_by) &&
          index === self.findIndex(r => r.user_email === recipient.user_email)
        );

        if (uniqueRecipients.length > 0) {
          // Non-blocking: Send notifications after response
          sendNotificationAsync(
            () => notificationService.notifyDocumentApprovalStatusChanged(
              result,
              'Rejected',
              uniqueRecipients,
              {
                user_id: rejected_by,
                user_name: rejected_by_name || rejected_by,
                user_email: rejected_by_name || rejected_by
              },
              result.tenant_id  // ✅ ADD tenant_id for multi-tenancy
            ),
            'document_rejected'
          );
        }
      } catch (notifError) {
        console.error('Failed to send rejection notifications:', notifError);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Document rejected',
      data: {
        document_id: result._id,
        approval_status: result.approval_status,
        status: result.status,
        approved_by: result.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: 'Error rejecting document',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/revoke-approval - Revoke/cancel approval request
router.put('/:id/revoke-approval', validateObjectId, validateRevokeApproval, requireIfMatch, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { revoked_by, revoked_by_name, comments } = req.body;

    // Validate required fields
    if (!revoked_by) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'revoked_by is required'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include version for concurrent safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Find the document with version check
    const document = await Document.findById(id).session(session);
    if (!document) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check version match
    if (document.__v !== clientVersion) {
      await session.abortTransaction();
      session.endSession();
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Check if approval is required (cannot revoke if already approved/rejected)
    if (!document.approval_required) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Document does not have an active approval request'
      });
    }

    if (document.approval_status === 'Approved') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke an already approved document'
      });
    }

    // Store previous status for history
    const previousStatus = document.approval_status;

    // Atomic update with conditional check
    const result = await Document.findOneAndUpdate(
      { 
        _id: id,
        __v: clientVersion,
        approval_required: true,
        approval_status: { $ne: 'Approved' }  // Cannot revoke if approved
      },
      {
        $set: {
          approval_required: false,
          approval_status: 'Revoked',
          approved_by: null,
          status: 'Draft',
          updated_at: new Date().toISOString()
        },
        $inc: { __v: 1 }
      },
      { 
        new: true,
        session,
        runValidators: true
      }
    );

    if (!result) {
      await session.abortTransaction();
      session.endSession();
      // Re-check document to provide better error message
      const currentDoc = await Document.findById(id);
      if (currentDoc && currentDoc.approval_status === 'Approved') {
        return res.status(409).json({
          success: false,
          message: 'Document was approved and cannot be revoked',
          code: 'ALREADY_APPROVED',
          details: {
            currentVersion: currentDoc.__v,
            approval_status: currentDoc.approval_status
          }
        });
      }
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: id
      });
    }

    // Create approval history record in transaction
    const approvalHistory = new ApprovalHistory({
      document_id: result._id,
      document_name: result.name,
      action: 'revoked',
      previous_status: previousStatus,
      new_status: 'Revoked',
      performed_by: revoked_by,
      performed_by_name: revoked_by_name,
      comments: comments || 'Approval request revoked',
      metadata: {
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }
    });

    await approvalHistory.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Approval request revoked',
      data: {
        document_id: result._id,
        approval_status: result.approval_status,
        status: result.status,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: 'Error revoking approval',
      error: error.message
    });
  }
});

// GET /api/documents/pending-approval - Get all documents pending approval
router.get('/pending-approval', async (req, res) => {
  try {
    const { assigned_to, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {
      approval_required: true,
      approval_status: 'Pending'
    };

    // Filter by assigned user if provided
    if (assigned_to) {
      query.approved_by = assigned_to;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Document.countDocuments(query);

    // Fetch documents
    const documents = await Document.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: documents.length,
      total: total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: documents
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching pending approvals',
      error: error.message
    });
  }
});

// GET /api/documents/:id/approval-history - Get approval history for a document
router.get('/:id/approval-history', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if document exists
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Fetch approval history
    const history = await ApprovalHistory.find({ document_id: id })
      .sort({ created_at: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: history.length,
      document_id: id,
      document_name: document.name,
      current_approval_status: document.approval_status,
      data: history
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching approval history',
      error: error.message
    });
  }
});

// ==================== DOCUMENT VERSIONING ENDPOINTS ====================

// Helper function to calculate next version number
function calculateNextVersion(currentVersion) {
  const parts = currentVersion.split('.');
  let major = parseInt(parts[0]) || 1;
  let minor = parseInt(parts[1]) || 0;

  // Increment minor version
  minor++;

  // If minor reaches 10, increment major and reset minor
  if (minor >= 10) {
    major++;
    minor = 0;
  }

  return `${major}.${minor}`;
}

// POST /api/documents/:id/versions - Upload new version of document
router.post('/:id/versions', preserveALSContext(upload.single('file')), validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required',
        code: 'FILE_REQUIRED'
      });
    }

    // Find the current document
    const currentDocument = await Document.findById(id);
    if (!currentDocument) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Parse uploaded_by from request body
    let uploadedBy;
    try {
      uploadedBy = typeof req.body.uploaded_by === 'string'
        ? JSON.parse(req.body.uploaded_by)
        : req.body.uploaded_by;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid uploaded_by format',
        code: 'INVALID_UPLOADED_BY'
      });
    }

    // Validate uploaded_by
    if (!uploadedBy || !uploadedBy.user_id) {
      return res.status(400).json({
        success: false,
        message: 'uploaded_by with user_id is required',
        code: 'UPLOADED_BY_REQUIRED'
      });
    }

    // Get document_group_id (initialize if this is first version)
    const documentGroupId = currentDocument.document_group_id || currentDocument._id.toString();

    // Get current document version (for superseded_version field)
    const currentVersionNumber = currentDocument.version_number || currentDocument.version || '1.0';

    // Find HIGHEST version in the document group by version_sequence (reliable number sorting)
    const highestVersionDoc = await Document.findOne({ document_group_id: documentGroupId })
      .sort({ version_sequence: -1 })
      .limit(1);

    // Calculate new version number based on HIGHEST existing version (not current)
    const highestVersionNumber = highestVersionDoc?.version_number || currentVersionNumber;
    const newVersionNumber = req.body.version_number || calculateNextVersion(highestVersionNumber);

    // Validate version number format
    if (!/^\d+\.\d+$/.test(newVersionNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version number format. Use X.Y format',
        code: 'INVALID_VERSION'
      });
    }

    // Check for version conflict
    const existingVersion = await Document.findOne({
      document_group_id: documentGroupId,
      version_number: newVersionNumber
    });

    if (existingVersion) {
      return res.status(400).json({
        success: false,
        message: `Version ${newVersionNumber} already exists`,
        code: 'VERSION_CONFLICT'
      });
    }

    // Use atomic counter for version_sequence to prevent race conditions
    const mongoose = require('mongoose');
    // Create a counter document per document group if it doesn't exist
    const Counter = mongoose.models.VersionCounter || mongoose.model('VersionCounter', new mongoose.Schema({
      _id: String, // document_group_id
      seq: { type: Number, default: 0 }
    }, { _id: false }));

    // Check if current document has version_sequence (for backward compatibility with old documents)
    const currentVersionSeq = currentDocument.version_sequence;

    // If this is the first version upload for an old document without version_sequence,
    // initialize counter to account for the existing version
    if (!currentVersionSeq) {
      // First time uploading to this document - current version is 1, new version will be 2
      await Counter.findByIdAndUpdate(
        documentGroupId,
        { $setOnInsert: { _id: documentGroupId, seq: 1 } },
        { upsert: true }
      );
    }

    // Atomically get and increment sequence number
    const counter = await Counter.findByIdAndUpdate(
      documentGroupId,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const newVersionSequence = counter.seq;

    // Upload new file to S3 with date-based versioned key
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const versionedFileName = `v${newVersionNumber}_${req.file.originalname}`;

    // Extract customer_id from different possible locations
    const customerId = currentDocument.customer?.customer_id || currentDocument.customer_id || 'unknown';

    // Get tenant ID from request (set by auth middleware)
    const tenantId = req.user?.tenant_id || req.tenantId || currentDocument.tenant_id;

    // Determine bucket name based on tenant
    let bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
    if (tenantId) {
      try {
        const tenant = await Tenant.findById(tenantId);
        if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
          bucketName = tenant.s3_bucket_name;
          console.log(`📦 Using tenant bucket for new version: ${bucketName}`);
        }
      } catch (error) {
        console.error('⚠️  Error fetching tenant bucket, using default:', error.message);
      }
    }

    // Prepare file for upload with versioned filename
    const fileForUpload = {
      ...req.file,
      originalname: versionedFileName
    };

    // Upload to S3 SYNCHRONOUSLY (blocking) to ensure file exists before saving to DB
    console.log(`📤 Uploading new version ${newVersionNumber} to S3...`);
    let uploadResult;

    try {
      // Try tenant-specific bucket first if available
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            console.log(`📦 Uploading to tenant bucket: ${tenant.s3_bucket_name}`);
            const tenantS3Service = new TenantS3Service(tenantId);
            uploadResult = await tenantS3Service.uploadFileToTenantBucket(
              fileForUpload,
              tenantId,
              tenant.tenant_name
            );
          } else {
            // Fall back to shared bucket
            uploadResult = await uploadFileToS3(
              fileForUpload,
              customerId,
              `documents/${documentGroupId}/${year}/${month}/${day}`,
              tenantId
            );
          }
        } catch (tenantError) {
          console.error('⚠️  Tenant bucket upload failed, using shared bucket:', tenantError.message);
          uploadResult = await uploadFileToS3(
            fileForUpload,
            customerId,
            `documents/${documentGroupId}/${year}/${month}/${day}`,
            tenantId
          );
        }
      } else {
        // No tenant - use shared bucket
        uploadResult = await uploadFileToS3(
          fileForUpload,
          customerId,
          `documents/${documentGroupId}/${year}/${month}/${day}`,
          tenantId
        );
      }

      if (!uploadResult.success) {
        console.error(`❌ S3 upload failed for version ${newVersionNumber}:`, uploadResult.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload file to S3',
          error: uploadResult.error
        });
      }

      console.log(`✅ Version ${newVersionNumber} uploaded successfully to S3`);
    } catch (error) {
      console.error(`❌ Error uploading version ${newVersionNumber} to S3:`, error.message);
      return res.status(500).json({
        success: false,
        message: 'Error uploading file to S3',
        error: error.message
      });
    }

    // Update existing document instead of creating new one
    let updatedDocument;
    try {
      // Prepare current file data to add to version history
      // If current document doesn't have version_sequence (old document), set it to 1
      const currentVersionSeqForHistory = currentDocument.version_sequence || 1;

      const currentVersionHistory = {
        version_number: currentVersionNumber,
        version_sequence: currentVersionSeqForHistory,
        file: currentDocument.file,
        uploaded_by: currentDocument.version_metadata?.uploaded_by || currentDocument.created_by || {},
        upload_timestamp: currentDocument.version_metadata?.upload_timestamp || new Date(currentDocument.created_at),
        change_notes: currentDocument.version_metadata?.change_notes || '',
        superseded_version: currentDocument.version_metadata?.superseded_version || null,
        is_current_version: false // Mark as not current since we're moving it to history
      };

      // Update the existing document with new version info
      updatedDocument = await Document.findByIdAndUpdate(
        id,
        {
          $set: {
            version_number: newVersionNumber,
            version: newVersionNumber,
            version_sequence: newVersionSequence,
            file: uploadResult.data,
            document_group_id: documentGroupId,
            version_metadata: {
              uploaded_by: {
                user_id: uploadedBy.user_id,
                user_name: uploadedBy.user_name || '',
                email: uploadedBy.email || ''
              },
              upload_timestamp: new Date(),
              change_notes: req.body.change_notes || '',
              superseded_version: currentVersionNumber,
              file_changes: {
                original_filename: req.file.originalname,
                file_size_bytes: req.file.size,
                file_hash: req.body.file_hash || ''
              }
            },
            updated_at: new Date().toISOString()
          },
          $push: {
            version_history: {
              $each: [currentVersionHistory],
              $position: 0  // Add at the beginning (most recent first)
            }
          }
        },
        { new: true }
      );

      if (!updatedDocument) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
          code: 'DOCUMENT_NOT_FOUND'
        });
      }
    } catch (error) {
      console.error('Error updating document version:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating document version',
        error: error.message
      });
    }

    // Non-blocking: Send notification emails and in-app notifications to all approvers after response
    if (currentDocument.approval_config?.enabled && currentDocument.approval_config.approvers?.length > 0) {
      const documentDetails = {
        name: updatedDocument.name || updatedDocument.file?.file_meta?.file_name || 'Unnamed Document',
        category: updatedDocument.category,
        type: updatedDocument.type
      };

      const statusUpdate = {
        newStatus: currentDocument.approval_config.status,
        oldStatus: currentVersionNumber,
        reviewerName: uploadedBy.user_name || uploadedBy.email || 'Unknown',
        reviewDate: new Date(),
        comment: `New version ${newVersionNumber} uploaded. ${req.body.change_notes || ''}`
      };

      // Non-blocking: Send emails to all approvers after response
      const approversToNotify = currentDocument.approval_config.approvers.filter(a => a.user_email);
      
      for (const approver of approversToNotify) {
        sendEmailAsync(
          () => emailService.sendDocumentUpdate({
            to: approver.user_email,
            documentId: updatedDocument._id.toString(),
            creatorName: approver.user_name || approver.user_email,
            documentDetails,
            statusUpdate
          }),
          `document_version_email_${approver.user_email}`
        );
      }

      // Non-blocking: Send in-app notifications to all approvers
      const recipients = approversToNotify.map(approver => ({
        user_id: approver.user_id,
        user_email: approver.user_email
      }));

      if (recipients.length > 0) {
        sendNotificationAsync(
          () => notificationService.notifyDocumentVersionUploaded(
            currentDocument,
            newVersionNumber,
            recipients,
            {
              user_id: uploadedBy.user_id,
              user_name: uploadedBy.user_name || uploadedBy.email || 'Unknown',
              user_email: uploadedBy.email
            },
            currentDocument.tenant_id  // ✅ ADD tenant_id for multi-tenancy
          ),
          'document_version_uploaded'
        );
      }
    }

    res.status(200).json({
      success: true,
      message: 'New version uploaded successfully',
      data: updatedDocument
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading new version',
      error: error.message
    });
  }
});

// GET /api/documents/:id/version-history - Get version history from single document record
router.get('/:id/version-history', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findById(id).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Build version history array from the document
    const versionHistory = [];
    
    // Add current version as first entry
    const currentUploadTimestamp = document.version_metadata?.upload_timestamp || document.created_at;
    versionHistory.push({
      version_number: document.version_number || document.version || '1.0',
      version_sequence: document.version_sequence || 1,
      file: document.file,
      uploaded_by: document.version_metadata?.uploaded_by || document.created_by || {},
      upload_timestamp: currentUploadTimestamp instanceof Date ? currentUploadTimestamp.toISOString() : currentUploadTimestamp,
      change_notes: document.version_metadata?.change_notes || '',
      is_current_version: true
    });

    // Add historical versions from version_history array
    if (document.version_history && document.version_history.length > 0) {
      document.version_history.forEach(hist => {
        const histUploadTimestamp = hist.upload_timestamp;
        versionHistory.push({
          version_number: hist.version_number,
          version_sequence: hist.version_sequence,
          file: hist.file,
          uploaded_by: hist.uploaded_by || {},
          upload_timestamp: histUploadTimestamp instanceof Date ? histUploadTimestamp.toISOString() : histUploadTimestamp,
          change_notes: hist.change_notes || '',
          is_current_version: false
        });
      });
    }

    // Sort by version_sequence descending (newest first)
    versionHistory.sort((a, b) => (b.version_sequence || 0) - (a.version_sequence || 0));

    res.status(200).json({
      success: true,
      data: versionHistory
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching version history',
      error: error.message
    });
  }
});

// GET /api/documents/versions/:documentGroupId - Get all versions of a document
router.get('/versions/:documentGroupId', async (req, res) => {
  try {
    const { documentGroupId } = req.params;

    // Find all versions with this document_group_id
    const versions = await Document.find({ document_group_id: documentGroupId })
      .sort({ version_sequence: -1 })
      .lean();

    if (!versions || versions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No versions found for this document group',
        code: 'NO_VERSIONS_FOUND'
      });
    }

    // Format version data for response
    const formattedVersions = versions.map(doc => ({
      _id: doc._id,
      version_number: doc.version_number,
      version_sequence: doc.version_sequence,
      is_current_version: doc.is_current_version,
      created_at: doc.version_metadata?.upload_timestamp || doc.created_at,
      created_by: doc.version_metadata?.uploaded_by?.user_name || doc.created_by || 'Unknown',
      file_name: doc.file?.file_meta?.file_name || doc.name,
      file_size: doc.file?.file_meta?.file_size || 0,
      file_url: doc.file?.file_meta?.file_url || '',
      change_notes: doc.version_metadata?.change_notes || null
    }));

    res.status(200).json({
      success: true,
      data: formattedVersions
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching document versions',
      error: error.message
    });
  }
});

// GET /api/documents/versions/:versionId/download - Download specific version
router.get('/versions/:versionId/download', validateObjectId, async (req, res) => {
  try {
    const { versionId } = req.params;

    const document = await Document.findById(versionId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Version not found',
        code: 'VERSION_NOT_FOUND'
      });
    }

    if (!document.file || !document.file.file_meta || !document.file.file_meta.file_key) {
      return res.status(404).json({
        success: false,
        message: 'Version file not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    const fileMeta = document.file.file_meta;
    let urlResult;

    // Check if document version is in tenant-specific bucket
    if (fileMeta.bucket_name && fileMeta.bucket_name !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`📥 Generating download URL for version in tenant bucket: ${fileMeta.bucket_name}`);
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePresignedUrlForTenantBucket(
        fileMeta.bucket_name,
        fileMeta.file_key,
        3600 // 1 hour expiry
      );
    } else {
      // Use shared bucket
      console.log('📥 Generating download URL for version in shared bucket');
      urlResult = await generatePresignedUrl(fileMeta.file_key, 3600);
    }

    if (!urlResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate download URL',
        code: 'DOWNLOAD_URL_ERROR',
        error: urlResult.error
      });
    }

    res.status(200).json({
      success: true,
      download_url: urlResult.url,
      expires_in: 3600,
      file_name: document.file.file_meta.file_name,
      version_number: document.version_number
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error downloading version',
      error: error.message
    });
  }
});

// GET /api/documents/:id/download-version/:versionSequence - Download a specific version from single-record history
router.get('/:id/download-version/:versionSequence', validateObjectId, async (req, res) => {
  try {
    const { id, versionSequence } = req.params;
    const versionSeq = parseInt(versionSequence);

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    let fileToDownload;
    let versionNumber;

    // Check if requesting current version
    const currentVersionSequence = document.version_sequence || 1;
    if (versionSeq === currentVersionSequence) {
      fileToDownload = document.file;
      versionNumber = document.version_number || document.version;
    } else {
      // Find in version history
      const historicalVersion = document.version_history?.find(
        v => v.version_sequence === versionSeq
      );

      if (!historicalVersion) {
        return res.status(404).json({
          success: false,
          message: 'Version not found in history',
          code: 'VERSION_NOT_FOUND'
        });
      }

      fileToDownload = historicalVersion.file;
      versionNumber = historicalVersion.version_number;
    }

    if (!fileToDownload || !fileToDownload.file_meta || !fileToDownload.file_meta.file_key) {
      return res.status(404).json({
        success: false,
        message: 'File not found for this version',
        code: 'FILE_NOT_FOUND'
      });
    }

    const fileMeta = fileToDownload.file_meta;
    let urlResult;

    // Determine bucket name - use from file_meta if available, otherwise determine from tenant
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      // Bucket name missing - determine from tenant
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
            console.log(`📦 Determined bucket from tenant for version: ${bucketName}`);
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
            console.log(`📦 Using default bucket for version (tenant has no bucket): ${bucketName}`);
          }
        } catch (error) {
          console.error('⚠️  Error fetching tenant for version, using default bucket:', error.message);
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        console.log(`📦 Using default bucket for version (no tenant): ${bucketName}`);
      }
    }

    // Check if version is in tenant-specific bucket
    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`📥 Generating download URL for version in tenant bucket: ${bucketName}`);
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePresignedUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        3600 // 1 hour expiry
      );
    } else {
      // Use shared bucket
      console.log('📥 Generating download URL for version in shared bucket');
      urlResult = await generatePresignedUrl(fileMeta.file_key, 3600);
    }

    if (!urlResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate download URL',
        code: 'DOWNLOAD_URL_ERROR',
        error: urlResult.error
      });
    }

    res.status(200).json({
      success: true,
      download_url: urlResult.url,
      expires_in: 3600,
      file_name: fileMeta.file_name,
      version_number: versionNumber
    });

  } catch (error) {
    console.error('Error downloading version:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading version',
      error: error.message
    });
  }
});

// POST /api/documents/:id/restore-version - Restore a version from single-record version history
router.post('/:id/restore-version', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { version_sequence, restored_by } = req.body;

    // Validate inputs
    if (!version_sequence) {
      return res.status(400).json({
        success: false,
        message: 'version_sequence is required',
        code: 'VERSION_SEQUENCE_REQUIRED'
      });
    }

    if (!restored_by || !restored_by.user_id) {
      return res.status(400).json({
        success: false,
        message: 'restored_by with user_id is required',
        code: 'RESTORED_BY_REQUIRED'
      });
    }

    // Find the document
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Check if trying to restore the current version
    const currentVersionSequence = document.version_sequence || 1;

    console.log('🔍 Restore Version Debug:', {
      requestedVersionSequence: version_sequence,
      currentVersionSequence: currentVersionSequence,
      documentVersionNumber: document.version_number || document.version,
      versionHistoryCount: document.version_history?.length || 0,
      versionHistorySequences: document.version_history?.map(v => v.version_sequence) || []
    });

    if (version_sequence === currentVersionSequence) {
      return res.status(400).json({
        success: false,
        message: 'This version is already the current version',
        code: 'ALREADY_CURRENT'
      });
    }

    // Find the version to restore in version_history
    const versionToRestore = document.version_history?.find(
      v => v.version_sequence === version_sequence
    );

    if (!versionToRestore) {
      return res.status(404).json({
        success: false,
        message: 'Version not found in history',
        code: 'VERSION_NOT_FOUND'
      });
    }

    // Calculate new version number
    const currentVersionNumber = document.version_number || document.version || '1.0';
    const calculateNextVersion = (currentVer) => {
      const parts = currentVer.split('.');
      const major = parseInt(parts[0]) || 1;
      const minor = parseInt(parts[1]) || 0;
      return `${major}.${minor + 1}`;
    };
    const newVersionNumber = calculateNextVersion(currentVersionNumber);
    const newVersionSequence = Math.max(
      currentVersionSequence,
      ...(document.version_history || []).map(v => v.version_sequence || 0)
    ) + 1;

    // Save current version to history
    const currentVersionForHistory = {
      version_number: currentVersionNumber,
      version_sequence: currentVersionSequence,
      file: document.file,
      uploaded_by: document.version_metadata?.uploaded_by || {},
      upload_timestamp: document.version_metadata?.upload_timestamp || document.updated_at || new Date(),
      change_notes: document.version_metadata?.change_notes || '',
      is_current_version: false
    };

    // Update document with restored version as current
    document.version_number = newVersionNumber;
    document.version = newVersionNumber;
    document.version_sequence = newVersionSequence;
    document.file = versionToRestore.file;

    // Ensure bucket_name is preserved - if missing from restored version, determine from tenant
    if (document.file?.file_meta && !document.file.file_meta.bucket_name) {
      let bucketName = process.env.AWS_BUCKET || 'dev-saas-common';

      // Try to get tenant-specific bucket
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
            console.log(`✅ Using tenant bucket for restored version: ${bucketName}`);
          }
        } catch (error) {
          console.error(`⚠️  Error fetching tenant bucket, using default:`, error.message);
        }
      }

      document.file.file_meta.bucket_name = bucketName;
      console.log(`⚠️  bucket_name missing in restored version, set to: ${bucketName}`);
    }

    // Update version metadata
    document.version_metadata = {
      uploaded_by: {
        user_id: restored_by.user_id,
        user_name: restored_by.user_name || '',
        email: restored_by.email || ''
      },
      upload_timestamp: new Date(),
      change_notes: `Restored from version ${versionToRestore.version_number}`,
      superseded_version: currentVersionNumber,
      file_changes: versionToRestore.file?.file_meta ? {
        original_filename: versionToRestore.file.file_meta.file_name || '',
        file_size_bytes: versionToRestore.file.file_meta.file_size || 0
      } : {}
    };

    // Remove the restored version from history (it's now becoming current)
    if (!document.version_history) {
      document.version_history = [];
    }
    const restoredVersionIndex = document.version_history.findIndex(
      v => v.version_sequence === version_sequence
    );
    if (restoredVersionIndex !== -1) {
      document.version_history.splice(restoredVersionIndex, 1);
    }

    // Add current version to history (before it was replaced)
    document.version_history.unshift(currentVersionForHistory);

    // Update timestamps
    document.updated_at = new Date();

    // Save the document
    await document.save();

    res.status(200).json({
      success: true,
      message: `Version ${versionToRestore.version_number} restored as version ${newVersionNumber}`,
      data: document
    });

  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring version',
      error: error.message
    });
  }
});

// DELETE /api/documents/:id/delete-version - Delete a version from single-record version history
router.delete('/:id/delete-version', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { version_sequence } = req.body;

    // Validate inputs
    if (!version_sequence) {
      return res.status(400).json({
        success: false,
        message: 'version_sequence is required',
        code: 'VERSION_SEQUENCE_REQUIRED'
      });
    }

    // Find the document
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Check if trying to delete the current version
    const currentVersionSequence = document.version_sequence || 1;
    if (version_sequence === currentVersionSequence) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the current version. Please restore a different version first if you want to remove this one.',
        code: 'CANNOT_DELETE_CURRENT'
      });
    }

    // Find the version to delete in version_history
    const versionIndex = document.version_history?.findIndex(
      v => v.version_sequence === version_sequence
    );

    if (versionIndex === -1 || versionIndex === undefined) {
      return res.status(404).json({
        success: false,
        message: 'Version not found in history',
        code: 'VERSION_NOT_FOUND'
      });
    }

    // Get version info before deletion for logging
    const versionToDelete = document.version_history[versionIndex];
    console.log('🗑️ Deleting version:', {
      documentId: id,
      versionNumber: versionToDelete.version_number,
      versionSequence: versionToDelete.version_sequence
    });

    // Optional: Delete the file from S3 if needed
    // const fileKey = versionToDelete.file?.file_meta?.file_key;
    // if (fileKey) {
    //   await deleteFileFromS3(fileKey);
    // }

    // Remove the version from history
    document.version_history.splice(versionIndex, 1);

    // Update timestamps
    document.updated_at = new Date();

    // Save the document
    await document.save();

    res.status(200).json({
      success: true,
      message: `Version ${versionToDelete.version_number} has been deleted`,
      data: {
        deleted_version: versionToDelete.version_number,
        deleted_sequence: versionToDelete.version_sequence,
        remaining_versions: document.version_history.length + 1 // +1 for current version
      }
    });

  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting version',
      error: error.message
    });
  }
});

// POST /api/documents/versions/:versionId/restore - Restore old version as current
router.post('/versions/:versionId/restore', validateObjectId, async (req, res) => {
  try {
    const { versionId } = req.params;
    const { restored_by } = req.body;

    // Validate restored_by
    if (!restored_by || !restored_by.user_id) {
      return res.status(400).json({
        success: false,
        message: 'restored_by with user_id is required',
        code: 'RESTORED_BY_REQUIRED'
      });
    }

    // Find the version to restore
    const versionToRestore = await Document.findById(versionId);

    if (!versionToRestore) {
      return res.status(404).json({
        success: false,
        message: 'Version not found',
        code: 'VERSION_NOT_FOUND'
      });
    }

    // Check if it's already the current version
    if (versionToRestore.is_current_version) {
      return res.status(400).json({
        success: false,
        message: 'This version is already the current version',
        code: 'ALREADY_CURRENT'
      });
    }

    const documentGroupId = versionToRestore.document_group_id;

    // Find current version
    const currentVersion = await Document.findOne({
      document_group_id: documentGroupId,
      is_current_version: true
    });

    // Get max version_sequence
    const maxSequenceDoc = await Document.findOne({ document_group_id: documentGroupId })
      .sort({ version_sequence: -1 })
      .limit(1);

    const newVersionSequence = (maxSequenceDoc?.version_sequence || 0) + 1;

    // Calculate new version number (increment from current)
    const currentVersionNumber = currentVersion?.version_number || versionToRestore.version_number || '1.0';
    const newVersionNumber = calculateNextVersion(currentVersionNumber);

    // Mark current version as not current
    if (currentVersion) {
      await Document.updateOne(
        { _id: currentVersion._id },
        {
          $set: {
            is_current_version: false,
            updated_at: new Date().toISOString()
          }
        }
      );
    }

    // Create minimal restored version document - ONLY file data and version metadata
    const restoredVersionData = {
      // Minimal required fields (schema requires these)
      name: `${versionToRestore.name} - v${newVersionNumber}`,
      category: 'Version',
      type: 'Version',

      // File data (from version being restored)
      file: versionToRestore.file,

      // Version tracking
      version: newVersionNumber,
      document_group_id: documentGroupId,
      version_number: newVersionNumber,
      is_current_version: true,
      version_sequence: newVersionSequence,

      // Version metadata - WHO, WHEN, WHERE restored
      version_metadata: {
        uploaded_by: {
          user_id: restored_by.user_id,
          user_name: restored_by.user_name || '',
          email: restored_by.email || ''
        },
        upload_timestamp: new Date(),
        change_notes: `Restored from version ${versionToRestore.version_number}`,
        superseded_version: currentVersionNumber,
        file_changes: versionToRestore.version_metadata?.file_changes || {
          original_filename: versionToRestore.file?.file_meta?.file_name || '',
          file_size_bytes: versionToRestore.file?.file_meta?.file_size || 0
        }
      },

      // Timestamps
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const restoredDocument = new Document(restoredVersionData);
    await restoredDocument.save();

    res.status(200).json({
      success: true,
      message: `Version ${versionToRestore.version_number} restored as version ${newVersionNumber}`,
      data: restoredDocument
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error restoring version',
      error: error.message
    });
  }
});

// ===== DOCUMENT REVIEW ENDPOINTS =====

// GET /api/documents/:id/comments - Get all comments for a document
router.get('/:id/comments', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    // Verify document exists
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Get comments
    const comments = await DocumentComment.getDocumentComments(id, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    const total = await DocumentComment.getCommentCount(id);

    res.status(200).json({
      success: true,
      count: comments.length,
      total,
      data: comments
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
});

// POST /api/documents/:id/review - Submit a review for a document
router.post('/:id/review', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      comment,
      user_id,
      user_name,
      user_email
    } = req.body;

    // Validation
    if (!status || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Status and comment are required'
      });
    }

    if (!user_email) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }

    // Verify document exists
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Track previous status to check if it changed
    const previousStatus = document.approval_config?.status || 'Unknown';
    const statusChanged = previousStatus !== status;

    // Create comment
    const documentComment = new DocumentComment({
      document_id: id,
      tenant_id: document.tenant_id,
      user_id: user_id || 'unknown',
      user_name: user_name || user_email,
      user_email: user_email.toLowerCase().trim(),
      comment: comment.trim(),
      status: status.trim()
    });

    await documentComment.save();

    // Update document approval status
    if (document.approval_config) {
      document.approval_config.status = status;

      // Add to approval history if not exists
      if (!document.approval_config.approval_history) {
        document.approval_config.approval_history = [];
      }

      document.approval_config.approval_history.push({
        user_id: user_id || 'unknown',
        user_name: user_name || user_email,
        user_email: user_email.toLowerCase().trim(),
        status: status,
        comment: comment.trim(),
        timestamp: new Date()
      });

      document.updated_at = new Date().toISOString();
      await document.save();
    }

    // Always send in-app notification to document creator (async, don't block response)
    setImmediate(async () => {
      const documentDetails = {
        name: document.name || document.file?.file_meta?.file_name || 'Unnamed Document',
        category: document.category,
        type: document.type
      };

      const statusUpdate = {
        newStatus: status,
        oldStatus: null,
        reviewerName: user_name || user_email,
        reviewDate: new Date(),
        comment: comment
      };

      // Build list of recipients for in-app notifications (always include creator)
      const inAppRecipients = [];

      // Add document creator if exists and not the reviewer
      // If created_by doesn't exist, try to find the creator from uploaded_by or other fields
      if (!document.created_by && document.uploaded_by) {
        // Try to get user info from uploaded_by field
        const User = require('../models/User');
        try {
          // If uploaded_by is an email, find the user
          if (typeof document.uploaded_by === 'string' && document.uploaded_by.includes('@')) {
            const creator = await User.findOne({ email: document.uploaded_by }).lean();
            if (creator && creator.email !== user_email) {
              inAppRecipients.push({
                user_id: creator._id.toString(),
                user_email: creator.email.toLowerCase()
              });
            }
          }
        } catch (err) {
          console.error('Error finding creator from uploaded_by:', err);
        }
      } else if (document.created_by?.email && document.created_by.email.toLowerCase() !== user_email.toLowerCase()) {
        // Use user_id if available, otherwise use email as fallback
        const creatorUserId = document.created_by.user_id || document.created_by.email.toLowerCase();

        inAppRecipients.push({
          user_id: creatorUserId,
          user_email: document.created_by.email.toLowerCase()
        });
      }

      // Build email recipient list: document owner + ALL approvers (excluding reviewer)
      const emailRecipients = [];

      // Add document owner if exists and not the reviewer
      if (document.created_by?.email && document.created_by.email.toLowerCase() !== user_email.toLowerCase()) {
        emailRecipients.push({
          email: document.created_by.email.toLowerCase(),
          name: document.created_by.user_name || document.created_by.email
        });
      }

      // Add ALL approvers (excluding the reviewer)
      if (document.approval_config?.approvers) {
        for (const approver of document.approval_config.approvers) {
          if (approver.user_email.toLowerCase() !== user_email.toLowerCase()) {
            // Avoid duplicates
            if (!emailRecipients.find(r => r.email === approver.user_email.toLowerCase())) {
              emailRecipients.push({
                email: approver.user_email.toLowerCase(),
                name: approver.user_name || approver.user_email
              });
            }
          }
        }
      }

      console.log('📧 Sending review notification emails to:', {
        count: emailRecipients.length,
        recipients: emailRecipients.map(r => r.email)
      });

      // Send email to all recipients
      for (const recipient of emailRecipients) {
        try {
          // Non-blocking: Send email after response
          sendEmailAsync(
            () => emailService.sendDocumentUpdate({
              to: recipient.email,
              documentId: id,
              creatorName: recipient.name,
              documentDetails,
              statusUpdate
            }),
            `document_update_email_${recipient.email}`
          );
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          // Email notification failed - continue
        }

        // Add to in-app notification list (avoid duplicates)
        if (!inAppRecipients.find(r => r.user_email === recipient.email)) {
          inAppRecipients.push({
            user_id: recipient.email,
            user_email: recipient.email
          });
        }
      }

      // Non-blocking: Send in-app notifications after response
      if (inAppRecipients.length > 0) {
        // If status was changed, notify about status change. Otherwise, notify about comment
        if (statusChanged) {
          sendNotificationAsync(
            () => notificationService.notifyDocumentStatusChanged(
              document,
              previousStatus,
              status,
              inAppRecipients,
              {
                user_id: user_id || 'unknown',
                user_name: user_name || user_email,
                user_email: user_email
              },
              document.tenant_id  // ✅ ADD tenant_id for multi-tenancy
            ),
            'document_status_changed_comment'
          );
        } else {
          sendNotificationAsync(
            () => notificationService.notifyDocumentCommentAdded(
              document,
              {
                _id: documentComment._id,
                user_id: user_id || 'unknown',
                user_name: user_name || user_email,
                user_email: user_email,
                comment: comment
              },
              inAppRecipients,
              document.tenant_id  // ✅ ADD tenant_id for multi-tenancy
            ),
            'document_comment_added'
          );
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: documentComment
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error submitting review',
      error: error.message
    });
  }
});

// GET /api/documents/:id/download - Get download URL for document
router.get('/:id/download', validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify document exists
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (!document.file?.file_meta?.file_key) {
      return res.status(404).json({
        success: false,
        message: 'File not found for this document'
      });
    }

    const fileMeta = document.file.file_meta;
    let result;

    // Determine bucket name - use from file_meta if available, otherwise determine from tenant
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      // Bucket name missing - determine from tenant
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
            console.log(`📦 Determined bucket from tenant: ${bucketName}`);
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
            console.log(`📦 Using default bucket (tenant has no bucket): ${bucketName}`);
          }
        } catch (error) {
          console.error('⚠️  Error fetching tenant, using default bucket:', error.message);
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        console.log(`📦 Using default bucket (no tenant): ${bucketName}`);
      }
    }

    // Check if document is in tenant-specific bucket
    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`📥 Generating download URL for tenant bucket: ${bucketName}`);
      const tenantS3Service = new TenantS3Service();
      result = await tenantS3Service.generatePresignedUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        3600 // 1 hour expiry
      );
    } else {
      // Use shared bucket
      console.log('📥 Generating download URL for shared bucket');
      result = await generatePresignedUrl(fileMeta.file_key, 3600);
    }

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Error generating download URL',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      download_url: result.url,
      file_name: document.file.file_meta.file_name,
      file_size: document.file.file_meta.file_size,
      expires_in: 3600 // seconds
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error generating download URL',
      error: error.message
    });
  }
});

module.exports = router;