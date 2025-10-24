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
const { checkResourcePermission, checkModulePermission } = require('../middleware/checkPermission');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB
  }
});

const router = express.Router();

// Helper function to fetch entity names by IDs
async function fetchEntityNames(documentData) {
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

    // Fetch customer name
    if (customerId) {
      const customer = await Customer.findById(customerId.toString());
      if (customer) {
        entityNames.customer_name = customer.organisation?.organisation_name ||
                                   customer.company_profile?.trading_name ||
                                   customer.company_profile?.organisation_name ||
                                   'Unknown Customer';
      }
    }

    // Fetch site name
    if (siteId) {
      const site = await Site.findById(siteId.toString());
      if (site) {
        entityNames.site_name = site.site_name;
      }
    }

    // Fetch building name
    if (buildingId) {
      const building = await Building.findById(buildingId.toString());
      if (building) {
        entityNames.building_name = building.building_name;
      }
    }

    // Fetch floor name
    if (floorId) {
      const floor = await Floor.findById(floorId.toString());
      if (floor) {
        entityNames.floor_name = floor.floor_name;
      }
    }

    // Fetch asset name (legacy single asset)
    if (assetId) {
      const asset = await Asset.findById(assetId.toString());
      if (asset) {
        // Build asset name from available fields
        entityNames.asset_name = asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset';
        entityNames.asset_type = asset.type || asset.category;
      } else {
        // Asset not found, use default name
        entityNames.asset_name = `Asset ${assetId}`;
      }
    }

    // Fetch multiple assets
    const assetIds = documentData.location?.assets?.map(a => a.asset_id) || 
                     (documentData.asset_ids && Array.isArray(documentData.asset_ids) ? documentData.asset_ids : []);
    if (assetIds.length > 0) {
      const assets = await Asset.find({ _id: { $in: assetIds.map(id => id.toString()) } });
      entityNames.assets = assets.map(asset => ({
        asset_id: asset._id.toString(),
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category || '' // Allow empty string if no type
      }));
    }

    // Fetch tenant name
    if (tenantId) {
      const tenant = await BuildingTenant.findById(tenantId.toString());
      if (tenant) {
        entityNames.tenant_name = tenant.tenant_name;
      }
    }

    // Fetch vendor name
    if (vendorId) {
      const vendor = await Vendor.findById(vendorId.toString());
      if (vendor) {
        entityNames.vendor_name = vendor.contractor_name;
      }
    }
  } catch (error) {

  }

  return entityNames;
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
    let filterQuery = {};

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

    // Populate entity names dynamically for each document
    const documentsWithNames = await Promise.all(
      documents.map(async (doc) => {
        const names = await fetchEntityNames(doc);
        return {
          ...doc,
          customer: {
            customer_id: doc.customer?.customer_id,
            customer_name: names.customer_name
          },
          location: {
            site: doc.location?.site?.site_id ? {
              site_id: doc.location.site.site_id,
              site_name: names.site_name
            } : undefined,
            building: doc.location?.building?.building_id ? {
              building_id: doc.location.building.building_id,
              building_name: names.building_name
            } : undefined,
            floor: doc.location?.floor?.floor_id ? {
              floor_id: doc.location.floor.floor_id,
              floor_name: names.floor_name
            } : undefined,
            // Multiple assets support
            assets: names.assets && names.assets.length > 0 ? names.assets : undefined,
            // Legacy single asset (for backward compatibility)
            asset: doc.location?.asset?.asset_id ? {
              asset_id: doc.location.asset.asset_id,
              asset_name: names.asset_name,
              asset_type: names.asset_type
            } : undefined,
            tenant: doc.location?.tenant?.tenant_id ? {
              tenant_id: doc.location.tenant.tenant_id,
              tenant_name: names.tenant_name
            } : undefined,
            vendor: doc.location?.vendor?.vendor_id ? {
              vendor_id: doc.location.vendor.vendor_id,
              vendor_name: names.vendor_name
            } : undefined
          }
        };
      })
    );

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

    const document = await Document.findById(req.params.id).setOptions({ _tenantId: req.tenant.tenantId }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Populate entity names dynamically
    const names = await fetchEntityNames(document);
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

    // Check if document is in tenant-specific bucket
    if (fileMeta.bucket_name && fileMeta.bucket_name !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`🔍 Generating preview URL for tenant bucket: ${fileMeta.bucket_name}`);
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePreviewUrlForTenantBucket(
        fileMeta.bucket_name,
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
router.post('/', checkModulePermission('documents', 'create'), upload.single('file'), validateCreateDocument, async (req, res) => {
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

      // Audit fields
      created_by: documentData.created_by,
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

    // Create document
    const document = new Document(documentPayload);
    await document.save();

    // Set document_group_id to the document's own ID after creation
    document.document_group_id = document._id.toString();
    await document.save();

    // Populate entity names for response
    const documentLean = document.toObject();
    const names = await fetchEntityNames(documentLean);
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

      // Send emails to all approvers asynchronously (fire and forget)
      setImmediate(() => {
        documentData.approval_config.approvers.forEach(async (approver) => {
          if (approver.user_email) {
            try {
              await emailService.sendDocumentAssignment({
                to: approver.user_email,
                documentId: document._id.toString(),
                approverName: approver.user_name || approver.user_email,
                documentDetails
              });
            } catch (emailError) {
              console.error(`Failed to send approval email to ${approver.user_email}:`, emailError);
            }
          }
        });
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
router.put('/bulk-update', async (req, res) => {
  try {
    const { document_ids, updates } = req.body;

    // Validate request body
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'document_ids array is required and must not be empty'
      });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'updates object is required and must not be empty'
      });
    }

    // Validate all document IDs are valid ObjectIds
    const invalidIds = document_ids.filter(id => !id || !id.match(/^[0-9a-fA-F]{24}$/));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format',
        invalid_ids: invalidIds
      });
    }

    // Fetch entity names for the updates
    const entityNames = await fetchEntityNames(updates);

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
      const assets = await Asset.find({ _id: { $in: updates.asset_ids.map(id => id.toString()) } });
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

    // Perform bulk update
    const result = await Document.updateMany(
      { _id: { $in: document_ids } },
      { $set: updateObject }
    );

    res.status(200).json({
      success: true,
      message: 'Documents updated successfully',
      matched_count: result.matchedCount,
      modified_count: result.modifiedCount,
      document_ids: document_ids
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error updating documents',
      error: error.message
    });
  }
});

// PUT /api/documents/:id - Update document
router.put('/:id', checkModulePermission('documents', 'edit'), validateObjectId, async (req, res) => {

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

    // Update ONLY if belongs to user's tenant
    const document = await Document.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: tenantId  // Ensure user owns this resource
      },
      updateData,
      { new: true, runValidators: true }
    ).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or you do not have permission to update it'
      });
    }

    // Populate entity names dynamically
    const names = await fetchEntityNames(document);
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
         // building tenant id
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

    // Send notifications for status change or approver assignment (async, don't block response)
    setImmediate(async () => {
      try {
        const userId = req.user?.userId || req.user?.sub || 'unknown';
        const userName = req.user?.name || req.user?.email || 'Unknown User';

        // Check if status changed
        if (oldDocument && document.status && oldDocument.status !== document.status) {
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

          if (uniqueRecipients.length > 0) {
            await notificationService.notifyDocumentStatusChanged(
              document,
              oldDocument.status,
              document.status,
              uniqueRecipients,
              {
                user_id: userId,
                user_name: userName,
                user_email: req.user?.email || userId
              }
            );
          }
        }

        // Check if approvers changed
        const oldApprovers = oldDocument?.approval_config?.approvers || [];
        const newApprovers = document?.approval_config?.approvers || [];

        // Find new approvers (those in new but not in old)
        const addedApprovers = newApprovers.filter(newApprover =>
          !oldApprovers.some(oldApprover => oldApprover.user_email === newApprover.user_email)
        );

        if (addedApprovers.length > 0) {
          await notificationService.notifyDocumentApproversAssigned(
            document,
            addedApprovers.map(approver => ({
              user_id: approver.user_id,
              user_email: approver.user_email
            })),
            {
              user_id: userId,
              user_name: userName,
              user_email: req.user?.email || userId
            }
          );
        }
      } catch (notifError) {
        console.error('Failed to send document update notifications:', notifError);
      }
    });

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: documentWithNames
    });
  } catch (error) {
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

    // Delete ONLY if belongs to user's tenant
    const document = await Document.findOneAndDelete({
      _id: req.params.id,
      tenant_id: tenantId  // Ensure user owns this resource
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or you do not have permission to delete it'
      });
    }

    // Delete file from S3 if exists
    if (document.file && document.file.file_meta && document.file.file_meta.file_key) {
      const deleteResult = await deleteFileFromS3(document.file.file_meta.file_key);
      if (!deleteResult.success) {

      }
    }

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

    const [documents, totalDocuments, categoryStats] = await Promise.all([
      Document.find(filterQuery)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Document.countDocuments(filterQuery),
      Document.aggregate([
        { $match: filterQuery },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
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
    ]);

    const result = stats[0] || {
      totalDocuments: 0,
      byCategory: []
    };

    res.status(200).json({
      success: true,
      data: result
    });
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
    ]);

    res.status(200).json({
      success: true,
      data: categoryStats
    });
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
router.post('/:id/request-approval', validateObjectId, validateRequestApproval, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, assigned_to_name, requested_by, requested_by_name, comments } = req.body;

    // Validate required fields
    if (!assigned_to) {
      return res.status(400).json({
        success: false,
        message: 'assigned_to is required'
      });
    }

    if (!requested_by) {
      return res.status(400).json({
        success: false,
        message: 'requested_by is required'
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document approval fields
    const previousStatus = document.approval_status;
    document.approval_required = true;
    document.approval_status = 'Pending';
    document.approved_by = assigned_to;
    document.updated_at = new Date().toISOString();

    await document.save();

    // Create approval history record
    const approvalHistory = new ApprovalHistory({
      document_id: document._id,
      document_name: document.name,
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

    await approvalHistory.save();

    res.status(200).json({
      success: true,
      message: 'Approval request submitted successfully',
      data: {
        document_id: document._id,
        approval_status: document.approval_status,
        approved_by: document.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error requesting approval',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/approve - Approve a document
router.put('/:id/approve', validateObjectId, validateApprove, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_by, approved_by_name, comments } = req.body;

    // Validate required fields
    if (!approved_by) {
      return res.status(400).json({
        success: false,
        message: 'approved_by is required'
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if approval is required
    if (!document.approval_required) {
      return res.status(400).json({
        success: false,
        message: 'Document does not require approval'
      });
    }

    // Update document approval fields
    const previousStatus = document.approval_status;
    document.approval_status = 'Approved';
    document.approved_by = approved_by;
    document.status = 'Approved'; // Also update main status
    document.updated_at = new Date().toISOString();

    await document.save();

    // Create approval history record
    const approvalHistory = new ApprovalHistory({
      document_id: document._id,
      document_name: document.name,
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

    await approvalHistory.save();

    // Send notifications (async, don't block response)
    setImmediate(async () => {
      try {
        const recipients = [];

        // Add document creator if available
        if (document.created_by) {
          recipients.push({
            user_id: document.created_by,
            user_email: document.created_by // Assuming email, might need to fetch from User model
          });
        }

        // Add all approvers from approval_config
        if (document.approval_config && document.approval_config.approvers) {
          document.approval_config.approvers.forEach(approver => {
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
          await notificationService.notifyDocumentApprovalStatusChanged(
            document,
            'Approved',
            uniqueRecipients,
            {
              user_id: approved_by,
              user_name: approved_by_name || approved_by,
              user_email: approved_by_name || approved_by
            }
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
        document_id: document._id,
        approval_status: document.approval_status,
        status: document.status,
        approved_by: document.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error approving document',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/reject - Reject a document
router.put('/:id/reject', validateObjectId, validateReject, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejected_by, rejected_by_name, comments } = req.body;

    // Validate required fields
    if (!rejected_by) {
      return res.status(400).json({
        success: false,
        message: 'rejected_by is required'
      });
    }

    if (!comments) {
      return res.status(400).json({
        success: false,
        message: 'comments are required when rejecting a document'
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if approval is required
    if (!document.approval_required) {
      return res.status(400).json({
        success: false,
        message: 'Document does not require approval'
      });
    }

    // Update document approval fields
    const previousStatus = document.approval_status;
    document.approval_status = 'Rejected';
    document.approved_by = rejected_by;
    document.status = 'Rejected'; // Also update main status
    document.updated_at = new Date().toISOString();

    await document.save();

    // Create approval history record
    const approvalHistory = new ApprovalHistory({
      document_id: document._id,
      document_name: document.name,
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

    await approvalHistory.save();

    // Send notifications (async, don't block response)
    setImmediate(async () => {
      try {
        const recipients = [];

        // Add document creator if available
        if (document.created_by) {
          recipients.push({
            user_id: document.created_by,
            user_email: document.created_by // Assuming email, might need to fetch from User model
          });
        }

        // Add all approvers from approval_config
        if (document.approval_config && document.approval_config.approvers) {
          document.approval_config.approvers.forEach(approver => {
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
          await notificationService.notifyDocumentApprovalStatusChanged(
            document,
            'Rejected',
            uniqueRecipients,
            {
              user_id: rejected_by,
              user_name: rejected_by_name || rejected_by,
              user_email: rejected_by_name || rejected_by
            }
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
        document_id: document._id,
        approval_status: document.approval_status,
        status: document.status,
        approved_by: document.approved_by,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: 'Error rejecting document',
      error: error.message
    });
  }
});

// PUT /api/documents/:id/revoke-approval - Revoke/cancel approval request
router.put('/:id/revoke-approval', validateObjectId, validateRevokeApproval, async (req, res) => {
  try {
    const { id } = req.params;
    const { revoked_by, revoked_by_name, comments } = req.body;

    // Validate required fields
    if (!revoked_by) {
      return res.status(400).json({
        success: false,
        message: 'revoked_by is required'
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if approval is required
    if (!document.approval_required) {
      return res.status(400).json({
        success: false,
        message: 'Document does not have an active approval request'
      });
    }

    // Update document approval fields
    const previousStatus = document.approval_status;
    document.approval_required = false;
    document.approval_status = 'Revoked';
    document.approved_by = null;
    document.status = 'Draft'; // Reset to draft
    document.updated_at = new Date().toISOString();

    await document.save();

    // Create approval history record
    const approvalHistory = new ApprovalHistory({
      document_id: document._id,
      document_name: document.name,
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

    await approvalHistory.save();

    res.status(200).json({
      success: true,
      message: 'Approval request revoked',
      data: {
        document_id: document._id,
        approval_status: document.approval_status,
        status: document.status,
        history_id: approvalHistory._id
      }
    });

  } catch (error) {

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
router.post('/:id/versions', upload.single('file'), validateObjectId, async (req, res) => {
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

    // Get max version_sequence
    const maxSequenceDoc = await Document.findOne({ document_group_id: documentGroupId })
      .sort({ version_sequence: -1 })
      .limit(1);

    const newVersionSequence = (maxSequenceDoc?.version_sequence || 0) + 1;

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

    // Generate S3 key and file metadata immediately (without uploading)
    const s3Key = `documents/${documentGroupId}/${year}/${month}/${day}/${Date.now()}-${versionedFileName}`;
    const fileUrl = `${process.env.AWS_URL}/${s3Key}`;
    const fileExtension = require('path').extname(req.file.originalname).toLowerCase().replace('.', '');

    const uploadResult = {
      success: true,
      data: {
        file_meta: {
          file_name: req.file.originalname,
          file_size: req.file.size,
          file_type: req.file.mimetype,
          file_extension: fileExtension,
          file_url: fileUrl,
          file_path: s3Key,
          file_key: s3Key,
          version: newVersionNumber,
          file_mime_type: req.file.mimetype,
          upload_status: 'pending' // Mark as pending upload
        }
      }
    };

    // Upload to S3 asynchronously in background (non-blocking)
    // Clone file buffer to prevent garbage collection before async upload completes
    const fileBufferCopy = Buffer.from(req.file.buffer);
    const fileForUpload = {
      ...req.file,
      buffer: fileBufferCopy,
      originalname: versionedFileName
    };

    setImmediate(async () => {
      try {
        const asyncUploadResult = await uploadFileToS3(
          fileForUpload,
          customerId,
          `documents/${documentGroupId}/${year}/${month}/${day}`,
          tenantId
        );

        if (!asyncUploadResult.success) {
          console.error(`Failed to upload file to S3 for version ${newVersionNumber}:`, asyncUploadResult.error);
        }
      } catch (error) {
        console.error(`Error uploading file to S3 for version ${newVersionNumber}:`, error.message);
      }
    });

    // Mark current version as not current
    await Document.updateOne(
      { _id: currentDocument._id },
      {
        $set: {
          is_current_version: false,
          document_group_id: documentGroupId,
          updated_at: new Date().toISOString()
        }
      }
    );

    // Update all other versions in the group to ensure document_group_id is set
    await Document.updateMany(
      {
        document_group_id: { $exists: false },
        _id: { $in: [currentDocument._id] }
      },
      { $set: { document_group_id: documentGroupId } }
    );

    // Create minimal version document - ONLY file data and version metadata
    const newVersionData = {
      // Minimal required fields (schema requires these)
      name: `${currentDocument.name} - v${newVersionNumber}`,
      category: 'Version',
      type: 'Version',

      // File data
      file: uploadResult.data,

      // Version tracking
      version: newVersionNumber,
      document_group_id: documentGroupId,
      version_number: newVersionNumber,
      is_current_version: true,
      version_sequence: newVersionSequence,

      // Version metadata - WHO, WHEN, WHERE uploaded
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

      // Timestamps
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const newVersionDocument = new Document(newVersionData);
    await newVersionDocument.save();

    // Update the original/current document with new version info
    await Document.findByIdAndUpdate(
      id,
      {
        $set: {
          version_number: newVersionNumber,
          version: newVersionNumber,
          is_current_version: true,
          updated_at: new Date().toISOString()
        }
      }
    );

    // Mark all other versions as not current
    await Document.updateMany(
      {
        document_group_id: documentGroupId,
        _id: { $nin: [id, newVersionDocument._id] }
      },
      {
        $set: { is_current_version: false }
      }
    );

    // Send notification emails and in-app notifications to all approvers (async, don't block response)
    if (currentDocument.approval_config?.enabled && currentDocument.approval_config.approvers?.length > 0) {
      setImmediate(async () => {
        const documentDetails = {
          name: newVersionDocument.name || newVersionDocument.file?.file_meta?.file_name || 'Unnamed Document',
          category: newVersionDocument.category,
          type: newVersionDocument.type
        };

        const statusUpdate = {
          newStatus: currentDocument.approval_config.status,
          oldStatus: currentVersionNumber,
          reviewerName: uploadedBy.user_name || uploadedBy.email || 'Unknown',
          reviewDate: new Date(),
          comment: `New version ${newVersionNumber} uploaded. ${req.body.change_notes || ''}`
        };

        // Send email to all approvers
        for (const approver of currentDocument.approval_config.approvers) {
          if (approver.user_email) {
            try {
              await emailService.sendDocumentUpdate({
                to: approver.user_email,
                documentId: newVersionDocument._id.toString(),
                creatorName: approver.user_name || approver.user_email,
                documentDetails,
                statusUpdate
              });
            } catch (emailError) {
              // Email notification failed - continue
            }
          }
        }

        // Send in-app notifications to all approvers
        try {
          const recipients = currentDocument.approval_config.approvers
            .filter(approver => approver.user_email)
            .map(approver => ({
              user_id: approver.user_id,
              user_email: approver.user_email
            }));

          if (recipients.length > 0) {
            await notificationService.notifyDocumentVersionUploaded(
              currentDocument,
              newVersionNumber,
              recipients,
              {
                user_id: uploadedBy.user_id,
                user_name: uploadedBy.user_name || uploadedBy.email || 'Unknown',
                user_email: uploadedBy.email
              }
            );
          }
        } catch (notifError) {
          console.error('Failed to send version upload notifications:', notifError);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'New version uploaded successfully',
      data: newVersionDocument
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading new version',
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
      user_email,
      send_notification,
      notify_recipients
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

      // Send email notifications only if enabled and recipients are selected
      if (send_notification && notify_recipients && Array.isArray(notify_recipients) && notify_recipients.length > 0) {
        // Send email to all specified recipients
        for (const recipientEmail of notify_recipients) {
          try {
            // Find recipient name from approvers list or created_by
            let recipientName = recipientEmail;

            if (document.approval_config?.approvers) {
              const approver = document.approval_config.approvers.find(a => a.user_email === recipientEmail);
              if (approver && approver.user_name) {
                recipientName = approver.user_name;
              }
            }

            // Check if it's the document creator
            if (document.created_by?.email === recipientEmail && document.created_by?.user_name) {
              recipientName = document.created_by.user_name;
            }

            await emailService.sendDocumentUpdate({
              to: recipientEmail,
              documentId: id,
              creatorName: recipientName,
              documentDetails,
              statusUpdate
            });
          } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Email notification failed - continue
          }
        }

        // Add email recipients to in-app notification list (avoid duplicates)
        for (const recipientEmail of notify_recipients) {
          if (!inAppRecipients.find(r => r.user_email === recipientEmail)) {
            inAppRecipients.push({
              user_id: recipientEmail,
              user_email: recipientEmail
            });
          }
        }
      }

      // Send in-app notifications (always, even if email is disabled)
      if (inAppRecipients.length > 0) {
        try {
          // If status was changed, notify about status change. Otherwise, notify about comment
          if (statusChanged) {
            await notificationService.notifyDocumentStatusChanged(
              document,
              previousStatus,
              status,
              inAppRecipients,
              {
                user_id: user_id || 'unknown',
                user_name: user_name || user_email,
                user_email: user_email
              }
            );
          } else {
            await notificationService.notifyDocumentCommentAdded(
              document,
              {
                _id: documentComment._id,
                user_id: user_id || 'unknown',
                user_name: user_name || user_email,
                user_email: user_email,
                comment: comment
              },
              inAppRecipients
            );
          }
        } catch (notifError) {
          console.error('Failed to send in-app notifications:', notifError);
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

    // Check if document is in tenant-specific bucket
    if (fileMeta.bucket_name && fileMeta.bucket_name !== process.env.AWS_BUCKET) {
      // Use tenant-specific S3 service
      console.log(`📥 Generating download URL for tenant bucket: ${fileMeta.bucket_name}`);
      const tenantS3Service = new TenantS3Service();
      result = await tenantS3Service.generatePresignedUrlForTenantBucket(
        fileMeta.bucket_name,
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