/**
 * Document Controller
 * Handles business logic for document CRUD operations.
 *
 * @module controllers/documentController
 */

const Document = require('../models/Document');
const Customer = require('../models/Customer');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const Organization = require('../models/Organization');
const filterBuilderService = require('../services/filterBuilderService');
const entityLookupService = require('../services/entityLookupService');
const TenantS3Service = require('../services/tenantS3Service');
const { uploadFileToS3, deleteFileFromS3, generatePreviewUrl, generatePresignedUrl } = require('../utils/s3Upload');
const mongoose = require('mongoose');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { resolveHierarchy } = require('../utils/hierarchyLookup');
const { sendVersionConflict } = require('../middleware/etagVersion');
const emailService = require('../utils/emailService');
const notificationService = require('../utils/notificationService');
const { sendNotificationAsync, sendEmailAsync } = require('../utils/asyncHelpers');
const {
  escapeRegex,
  buildSearchQuery,
  buildPagination,
  buildSort,
  buildApiResponse,
  handleError,
  sanitizeQuery
} = require('../middleware/searchHelpers');

/**
 * List all documents with filtering, pagination, and category statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const list = async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const tenantId = req.tenant.tenantId;
    const sanitizedQuery = sanitizeQuery(req.query);
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      asset_id,
      tenant_id: buildingTenantId,
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

    // Build base filter query
    let filterQuery = {
      is_delete: { $ne: true }
    };

    // Entity filters using filterBuilderService
    const customerFilter = filterBuilderService.buildMultiSelectFilter(customer_id);
    if (customerFilter) filterQuery['customer.customer_id'] = customerFilter;

    const siteFilter = filterBuilderService.buildMultiSelectFilter(site_id);
    if (siteFilter) filterQuery['location.site.site_id'] = siteFilter;

    const buildingFilter = filterBuilderService.buildMultiSelectFilter(building_id);
    if (buildingFilter) filterQuery['location.building.building_id'] = buildingFilter;

    const floorFilter = filterBuilderService.buildMultiSelectFilter(floor_id);
    if (floorFilter) filterQuery['location.floor.floor_id'] = floorFilter;

    // Asset filter - special handling for both legacy single and new multiple assets
    if (asset_id) {
      const assetIds = asset_id.includes(',')
        ? asset_id.split(',').map(id => id.trim())
        : [asset_id];

      const assetFilter = {
        $or: [
          { 'location.asset.asset_id': { $in: assetIds } },
          { 'location.assets': { $elemMatch: { asset_id: { $in: assetIds } } } }
        ]
      };

      if (filterQuery.$or) {
        filterQuery.$and = filterQuery.$and || [];
        filterQuery.$and.push(assetFilter);
      } else {
        Object.assign(filterQuery, assetFilter);
      }
    }

    const tenantFilter = filterBuilderService.buildMultiSelectFilter(buildingTenantId);
    if (tenantFilter) filterQuery['location.tenant.tenant_id'] = tenantFilter;

    const vendorFilter = filterBuilderService.buildMultiSelectFilter(vendor_id);
    if (vendorFilter) filterQuery['location.vendor.vendor_id'] = vendorFilter;

    // Document filters
    const categoryFilter = filterBuilderService.buildMultiSelectFilter(category);
    if (categoryFilter) filterQuery.category = categoryFilter;

    const typeFilter = filterBuilderService.buildMultiSelectFilter(type);
    if (typeFilter) filterQuery.type = typeFilter;

    const statusFilter = filterBuilderService.buildMultiSelectFilter(status);
    if (statusFilter) filterQuery.status = statusFilter;

    const disciplineFilter = filterBuilderService.buildMultiSelectFilter(engineering_discipline);
    if (disciplineFilter) filterQuery.engineering_discipline = disciplineFilter;

    // Apply document category/discipline access restrictions (Fine-Grained Permissions)
    applyDocumentAccessRestrictions(req, filterQuery);

    // Compliance filters
    const frameworkFilter = filterBuilderService.buildMultiSelectFilter(regulatory_framework);
    if (frameworkFilter) filterQuery['metadata.regulatory_framework'] = frameworkFilter;

    const complianceFilter = filterBuilderService.buildMultiSelectFilter(compliance_status);
    if (complianceFilter) filterQuery['metadata.compliance_status'] = complianceFilter;

    // Drawing Register filters
    const drawingStatusFilter = filterBuilderService.buildMultiSelectFilter(drawing_status);
    if (drawingStatusFilter) filterQuery['drawing_info.drawing_status'] = drawingStatusFilter;

    const preparedByFilter = filterBuilderService.buildMultiSelectFilter(prepared_by);
    if (preparedByFilter) filterQuery['drawing_info.prepared_by'] = preparedByFilter;

    const approvedByFilter = filterBuilderService.buildMultiSelectFilter(approved_by_user);
    if (approvedByFilter) filterQuery['drawing_info.approved_by_user'] = approvedByFilter;

    // Access Control filters
    const accessFilter = filterBuilderService.buildMultiSelectFilter(access_level);
    if (accessFilter) filterQuery['access_control.access_level'] = accessFilter;

    // Tags filter
    const tagParam = tag || tags;
    if (tagParam) {
      const tagsList = tagParam.includes(',')
        ? tagParam.split(',').map(t => t.trim())
        : tagParam;
      const tagArray = Array.isArray(tagsList) ? tagsList : [tagsList];
      filterQuery['tags.tags'] = {
        $in: tagArray.map(t => new RegExp(`^${filterBuilderService.escapeRegex(t)}$`, 'i'))
      };
    }

    // Advanced search
    const searchQuery = buildSearchQuery(search);
    if (Object.keys(searchQuery).length > 0) {
      filterQuery = { ...filterQuery, ...searchQuery };
    }

    // Filter out version documents (legacy records)
    excludeVersionDocuments(filterQuery);

    // Pagination and sorting
    const pagination = buildPagination(page, limit);
    const sortObj = buildSort(sort, order);

    // Execute queries in parallel
    const [documents, totalDocuments, categoryStats] = await Promise.all([
      Document.find(filterQuery)
        .setOptions({ _tenantId: tenantId })
        .sort(sortObj)
        .skip(pagination.skip)
        .limit(pagination.limitNum)
        .lean()
        .exec(),
      Document.countDocuments(filterQuery).setOptions({ _tenantId: tenantId }).exec(),
      Document.aggregate([
        { $match: { ...filterQuery, tenant_id: tenantId } },
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

    // Batch populate entity names using entityLookupService
    const documentsWithNames = await entityLookupService.batchFetchEntityNames(documents, tenantId);

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
    console.error('Error in documentController.list:', error);
    handleError(error, res, 'fetching documents');
  }
};

/**
 * Get document by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getById = async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const tenantId = req.tenant.tenantId;

    const document = await Document.findOne({
      _id: req.params.id,
      tenant_id: tenantId,
      is_delete: { $ne: true }
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Populate entity names using entityLookupService
    const names = await entityLookupService.fetchEntityNames(document, tenantId);
    const documentWithNames = buildDocumentWithNames(document, names);

    res.status(200).json({
      success: true,
      data: documentWithNames
    });
  } catch (error) {
    console.error('Error in documentController.getById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      error: error.message
    });
  }
};

/**
 * Create new document with file upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const create = async (req, res) => {
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

    // Check storage limit before uploading
    if (req.tenant?.tenantId) {
      const organization = await Organization.findOne({ tenant_id: req.tenant.tenantId });
      if (organization && !organization.canAddStorage(req.file.size)) {
        const usedGB = (organization.current_usage?.storage_bytes || 0) / (1024 * 1024 * 1024);
        return res.status(403).json({
          success: false,
          error: 'STORAGE_LIMIT_REACHED',
          message: `Storage limit reached. Your plan allows ${organization.limits.storage_gb} GB.`,
          limit_gb: organization.limits.storage_gb,
          used_gb: parseFloat(usedGB.toFixed(2)),
          file_size_bytes: req.file.size,
          unit: 'gb'
        });
      }
    }

    // Use validated data from middleware
    let documentData = req.validatedData;

    // Auto-populate parent entity IDs from child selections
    documentData = await resolveHierarchy(documentData);

    // Validate that customer_id was populated
    if (!documentData.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a customer to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    // Get logged-in user data
    const { getCurrentUser } = require('../utils/authHelper');
    const currentUser = getCurrentUser(req);

    // Get customer for validation
    const customer = await Customer.findById(documentData.customer_id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get tenant ID from request
    const tenantId = req.user?.tenant_id || req.tenantId;

    // Upload file to S3
    let uploadResult;
    if (tenantId) {
      try {
        const tenant = await Tenant.findById(tenantId);
        if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
          const tenantS3Service = new TenantS3Service(tenantId);
          uploadResult = await tenantS3Service.uploadFileToTenantBucket(
            req.file,
            tenantId,
            tenant.tenant_name
          );
        } else {
          uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
        }
      } catch (tenantS3Error) {
        console.error('Tenant bucket upload failed, falling back to shared bucket:', tenantS3Error.message);
        uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
      }
    } else {
      uploadResult = await uploadFileToS3(req.file, documentData.customer_id, null, tenantId);
    }

    if (!uploadResult.success) {
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: uploadResult.error
      });
    }

    // Build document object
    const documentPayload = buildDocumentPayload(documentData, uploadResult, req, currentUser);

    // Handle location associations
    buildLocationPayload(documentPayload, documentData);

    // Handle multiple assets
    if (documentData.asset_ids && Array.isArray(documentData.asset_ids) && documentData.asset_ids.length > 0) {
      const assets = await Asset.find({ asset_id: { $in: documentData.asset_ids } });
      documentPayload.location.assets = assets.map(asset => ({
        asset_id: asset.asset_id,
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category || ''
      }));
    } else if (documentData.asset_id) {
      documentPayload.location.asset = { asset_id: documentData.asset_id };
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
    document.document_group_id = document._id.toString();
    await document.save();

    // Update storage usage in organization
    if (req.tenant?.tenantId && req.file?.size) {
      try {
        const organization = await Organization.findOne({ tenant_id: req.tenant.tenantId });
        if (organization) {
          const newStorageBytes = (organization.current_usage?.storage_bytes || 0) + req.file.size;
          await organization.updateUsage('storage_bytes', newStorageBytes);
          organization.storage_cache = { last_synced: new Date(), source: 'db' };
          await organization.save();
        }
      } catch (storageError) {
        console.error('Failed to update storage usage:', storageError.message);
      }
    }

    // Log audit
    const documentName = document.name || document.file?.file_meta?.file_name || 'New Document';
    logCreate({ module: 'document', resourceName: documentName, req, moduleId: document._id, resource: document.toObject() });

    // Populate entity names for response
    const documentLean = document.toObject();
    const names = await entityLookupService.fetchEntityNames(documentLean, req.tenant.tenantId);
    const documentWithNames = buildDocumentWithNames(documentLean, names);

    // Send approval emails asynchronously
    sendApprovalNotifications(documentData, document, currentUser);

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: documentWithNames
    });

  } catch (error) {
    console.error('Error in documentController.create:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating document',
      error: error.message
    });
  }
};

/**
 * Update document
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const update = async (req, res) => {
  try {
    // Verify tenant context exists
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found. User must be associated with a tenant.'
      });
    }

    const tenantId = req.tenant.tenantId;

    // Get old document to compare changes
    const oldDocument = await Document.findById(req.params.id).setOptions({ _tenantId: tenantId }).lean();

    let updateData = { ...req.body };

    // Auto-populate parent entity IDs from child selections
    updateData = await resolveHierarchy(updateData);

    // Validate that customer_id is present
    if (!updateData.customer_id && !oldDocument?.customer?.customer_id) {
      return res.status(400).json({
        success: false,
        message: 'The selected building is not properly configured. Please contact your administrator to assign a customer to this building.',
        errors: [{
          field: 'building_id',
          message: 'Building does not have a valid customer assignment'
        }]
      });
    }

    updateData.updated_at = new Date().toISOString();

    // Prevent tenant_id from being changed
    delete updateData.tenant_id;
    delete updateData.metadata;

    // Handle customer fields - convert from root level to nested structure
    if (updateData.customer_id) {
      if (!updateData.customer) updateData.customer = {};
      updateData.customer.customer_id = updateData.customer_id;
      delete updateData.customer_id;
    }
    if (updateData.customer_name) {
      if (!updateData.customer) updateData.customer = {};
      updateData.customer.customer_name = updateData.customer_name;
      delete updateData.customer_name;
    }

    // Clean root-level compliance fields
    const rootFieldsToClean = [
      'engineering_discipline', 'regulatory_framework', 'certification_number',
      'compliance_framework', 'compliance_status', 'issue_date', 'expiry_date', 'frequency'
    ];
    rootFieldsToClean.forEach(field => {
      if (updateData[field] === 'none' || updateData[field] === '') {
        delete updateData[field];
      }
    });

    // Clean drawing_info and access_control
    if (updateData.drawing_info) {
      updateData.drawing_info = cleanObjectFields(updateData.drawing_info);
    }
    if (updateData.access_control) {
      updateData.access_control = cleanObjectFields(updateData.access_control);
    }

    // Get version from If-Match header or request body
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined) {
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include If-Match header or __v in body for concurrent write safety.',
        code: 'PRECONDITION_REQUIRED'
      });
    }

    // Load document
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

    // Check version match
    if (document.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: req.params.id
      });
    }

    // Build atomic update object
    const allowedFields = [
      'name', 'description', 'category', 'type', 'engineering_discipline',
      'regulatory_framework', 'certification_number', 'compliance_framework',
      'compliance_status', 'issue_date', 'expiry_date', 'review_date', 'frequency',
      'status', 'tags', 'customer', 'location', 'drawing_info', 'access_control',
      'approval_config', 'file', 'version_number', 'version', 'is_current_version'
    ];

    const atomicUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null && allowedFields.includes(key)) {
        atomicUpdate[key] = updateData[key];
      }
    });

    atomicUpdate.updated_at = new Date().toISOString();

    // Perform atomic update with version check
    const result = await Document.findOneAndUpdate(
      { _id: req.params.id, __v: clientVersion },
      { $set: atomicUpdate, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: document.__v,
        resource: 'Document',
        id: req.params.id
      });
    }

    // Populate entity names for response
    const documentLean = result.toObject();
    const names = await entityLookupService.fetchEntityNames(documentLean, tenantId);
    const documentWithNames = buildDocumentWithNames(documentLean, names);

    // Send notifications asynchronously (non-blocking)
    sendUpdateNotifications(oldDocument, result, req);

    // Log audit
    logUpdate({
      module: 'document',
      resourceName: result.name || result.file?.file_meta?.file_name || 'Document',
      req,
      moduleId: result._id,
      resource: result.toObject()
    });

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: documentWithNames
    });
  } catch (error) {
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion ?? req.body.__v,
        currentVersion: error.version,
        resource: 'Document',
        id: req.params.id
      });
    }

    console.error('Error in documentController.update:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating document',
      error: error.message
    });
  }
};

/**
 * Delete document (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const remove = async (req, res) => {
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
      tenant_id: tenantId
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

    // Decrement storage usage in organization
    const fileSize = document.file?.file_meta?.file_size || 0;
    if (tenantId && fileSize > 0) {
      try {
        const organization = await Organization.findOne({ tenant_id: tenantId });
        if (organization) {
          const newStorageBytes = Math.max(0, (organization.current_usage?.storage_bytes || 0) - fileSize);
          await organization.updateUsage('storage_bytes', newStorageBytes);
          organization.storage_cache = { last_synced: new Date(), source: 'db' };
          await organization.save();
        }
      } catch (storageError) {
        console.error('Failed to update storage usage:', storageError.message);
      }
    }

    // Log audit
    logDelete({ module: 'document', resourceName: document.name || 'Document', req, moduleId: document._id, resource: document.toObject() });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error in documentController.remove:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
      error: error.message
    });
  }
};

/**
 * Bulk delete documents
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const bulkRemove = async (req, res) => {
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
    console.error('Error in documentController.bulkRemove:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing bulk delete',
      error: error.message
    });
  }
};

/**
 * Get unique tags from documents
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getTags = async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    // Build match query for optional filtering
    let matchQuery = {};

    // CRITICAL: Filter by tenant for multi-tenant data isolation
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
      .filter(tag => tag && tag.trim().length > 0);

    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    console.error('Error in documentController.getTags:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document tags',
      error: error.message
    });
  }
};

/**
 * Get document statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStats = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

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
    console.error('Error in documentController.getStats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document statistics',
      error: error.message
    });
  }
};

/**
 * Get document preview URL
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPreviewUrl = async (req, res) => {
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

    // Determine bucket name
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
          }
        } catch (error) {
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
      }
    }

    // Generate URL based on bucket type
    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePreviewUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        fileMeta.file_name,
        fileMeta.file_type,
        3600
      );
    } else {
      urlResult = await generatePreviewUrl(
        fileMeta.file_key,
        fileMeta.file_name,
        fileMeta.file_type,
        3600
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
    console.error('Error in documentController.getPreviewUrl:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating preview URL',
      error: error.message
    });
  }
};

/**
 * Get document download URL
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDownloadUrl = async (req, res) => {
  try {
    const { id } = req.params;

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

    // Determine bucket name
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
          }
        } catch (error) {
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
      }
    }

    // Generate URL based on bucket type
    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      const tenantS3Service = new TenantS3Service();
      result = await tenantS3Service.generatePresignedUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        3600
      );
    } else {
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
      expires_in: 3600
    });

  } catch (error) {
    console.error('Error in documentController.getDownloadUrl:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating download URL',
      error: error.message
    });
  }
};

/**
 * Bulk update multiple documents
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const bulkUpdate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { document_ids, updates, versions } = req.body;

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
    const entityNames = await fetchEntityNamesForBulkUpdate(updates, tenantId);

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

    // Handle multiple assets
    if (updates.asset_ids && Array.isArray(updates.asset_ids) && updates.asset_ids.length > 0) {
      const assets = await Asset.find({ asset_id: { $in: updates.asset_ids } }).session(session);
      updateObject['location.assets'] = assets.map(asset => ({
        asset_id: asset.asset_id,
        asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
        asset_type: asset.type || asset.category
      }));
      updateObject['location.asset'] = undefined;
    } else if (updates.asset_id) {
      updateObject['location.asset'] = {
        asset_id: updates.asset_id,
        ...(entityNames.asset_name && { asset_name: entityNames.asset_name }),
        ...(entityNames.asset_type && { asset_type: entityNames.asset_type })
      };
    }

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

    if (updates.status) updateObject.status = updates.status;
    if (updates.category) updateObject.category = updates.category;
    if (updates.type) updateObject.type = updates.type;
    if (updates.engineering_discipline) updateObject.engineering_discipline = updates.engineering_discipline;

    updateObject.updated_at = new Date().toISOString();

    // Perform individual updates with version checking
    const updateResults = [];
    const conflicts = [];

    for (const docId of document_ids) {
      const clientVersion = versions?.[docId] ?? req.clientVersion ?? req.body.__v;

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
    console.error('Error in documentController.bulkUpdate:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating documents',
      error: error.message
    });
  }
};

// ============ Private Helper Functions ============

/**
 * Fetch entity names for bulk update
 * @param {Object} updates - Update object
 * @param {string} tenantId - Tenant ID
 * @returns {Object} - Entity names
 * @private
 */
async function fetchEntityNamesForBulkUpdate(updates, tenantId) {
  const names = {};
  const Site = require('../models/Site');
  const Building = require('../models/Building');
  const Floor = require('../models/Floor');
  const Vendor = require('../models/Vendor');
  const BuildingTenant = require('../models/BuildingTenant');

  if (updates.customer_id) {
    const customer = await Customer.findById(updates.customer_id);
    if (customer) names.customer_name = customer.customer_name;
  }

  if (updates.site_id) {
    const site = await Site.findById(updates.site_id);
    if (site) names.site_name = site.site_name;
  }

  if (updates.building_id) {
    const building = await Building.findById(updates.building_id);
    if (building) names.building_name = building.building_name;
  }

  if (updates.floor_id) {
    const floor = await Floor.findById(updates.floor_id);
    if (floor) names.floor_name = floor.floor_name;
  }

  if (updates.asset_id) {
    const asset = await Asset.findOne({ asset_id: updates.asset_id });
    if (asset) {
      names.asset_name = asset.asset_no || asset.device_id || asset.asset_id;
      names.asset_type = asset.type || asset.category;
    }
  }

  if (updates.tenant_id) {
    const buildingTenant = await BuildingTenant.findById(updates.tenant_id);
    if (buildingTenant) names.tenant_name = buildingTenant.tenant_name;
  }

  if (updates.vendor_id) {
    const vendor = await Vendor.findById(updates.vendor_id);
    if (vendor) names.vendor_name = vendor.vendor_name;
  }

  return names;
}

/**
 * Apply document category/discipline access restrictions based on user permissions
 * @param {Object} req - Express request object
 * @param {Object} filterQuery - MongoDB filter query to modify
 * @private
 */
function applyDocumentAccessRestrictions(req, filterQuery) {
  if (!req.documentFilters || req.documentFilters.hasFullAccess) {
    return;
  }

  // Apply category restrictions
  if (req.documentFilters.allowedCategories && req.documentFilters.allowedCategories.length > 0) {
    if (filterQuery.category) {
      const existingCategories = Array.isArray(filterQuery.category.$in)
        ? filterQuery.category.$in
        : [filterQuery.category];
      const allowedSet = new Set(req.documentFilters.allowedCategories);
      const intersection = existingCategories.filter(cat => allowedSet.has(cat));

      filterQuery.category = intersection.length === 0
        ? { $in: [] }
        : { $in: intersection };
    } else {
      filterQuery.category = { $in: req.documentFilters.allowedCategories };
    }
  }

  // Apply discipline restrictions
  if (req.documentFilters.allowedDisciplines && req.documentFilters.allowedDisciplines.length > 0) {
    if (filterQuery.engineering_discipline) {
      const existingDisciplines = Array.isArray(filterQuery.engineering_discipline.$in)
        ? filterQuery.engineering_discipline.$in
        : [filterQuery.engineering_discipline];
      const allowedSet = new Set(req.documentFilters.allowedDisciplines);
      const intersection = existingDisciplines.filter(disc => allowedSet.has(disc));

      filterQuery.engineering_discipline = intersection.length === 0
        ? { $in: [] }
        : { $in: intersection };
    } else {
      filterQuery.engineering_discipline = { $in: req.documentFilters.allowedDisciplines };
    }
  }

  // If user has NO allowed categories and NO allowed disciplines
  if (req.documentFilters.allowedCategories.length === 0 &&
      req.documentFilters.allowedDisciplines.length === 0) {
    filterQuery._id = { $in: [] };
  }
}

/**
 * Exclude version documents from filter query
 * @param {Object} filterQuery - MongoDB filter query to modify
 * @private
 */
function excludeVersionDocuments(filterQuery) {
  if (filterQuery.category && filterQuery.category.$in) {
    filterQuery.category.$in = filterQuery.category.$in.filter(cat => cat !== 'Version');
  } else if (filterQuery.category && typeof filterQuery.category === 'object' && !filterQuery.category.$ne) {
    filterQuery.category = { ...filterQuery.category, $ne: 'Version' };
  } else if (!filterQuery.category) {
    filterQuery.category = { $ne: 'Version' };
  }
}

/**
 * Build document with populated entity names
 * @param {Object} document - Document object
 * @param {Object} names - Entity names object
 * @returns {Object} - Document with names
 * @private
 */
function buildDocumentWithNames(document, names) {
  return {
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
      assets: names.assets && names.assets.length > 0 ? names.assets :
        (document.location?.assets && document.location.assets.length > 0 ? document.location.assets : undefined),
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
}

/**
 * Build document payload for creation
 * @param {Object} documentData - Validated document data
 * @param {Object} uploadResult - S3 upload result
 * @param {Object} req - Express request object
 * @param {Object} currentUser - Current user info
 * @returns {Object} - Document payload
 * @private
 */
function buildDocumentPayload(documentData, uploadResult, req, currentUser) {
  return {
    name: documentData.name,
    description: documentData.description,
    version: documentData.version || '1.0',
    category: documentData.category,
    type: documentData.type,
    engineering_discipline: documentData.engineering_discipline,
    file: uploadResult.data,
    version_number: documentData.version || '1.0',
    is_current_version: true,
    version_sequence: 1,
    tags: documentData.tags ? { tags: Array.isArray(documentData.tags) ? documentData.tags : [documentData.tags] } : { tags: [] },
    customer: { customer_id: documentData.customer_id },
    location: {},
    ...(documentData.regulatory_framework && documentData.regulatory_framework !== 'none' && { regulatory_framework: documentData.regulatory_framework }),
    ...(documentData.certification_number && documentData.certification_number !== 'none' && { certification_number: documentData.certification_number }),
    ...(documentData.compliance_framework && documentData.compliance_framework !== 'none' && { compliance_framework: documentData.compliance_framework }),
    ...(documentData.compliance_status && documentData.compliance_status !== 'none' && { compliance_status: documentData.compliance_status }),
    ...(documentData.issue_date && documentData.issue_date !== 'none' && { issue_date: documentData.issue_date }),
    ...(documentData.expiry_date && documentData.expiry_date !== 'none' && { expiry_date: documentData.expiry_date }),
    ...((documentData.review_date && documentData.review_date !== 'none')
      ? { review_date: documentData.review_date }
      : (documentData.category && documentData.category.toLowerCase().includes('report'))
        ? { review_date: new Date().toISOString().split('T')[0] }
        : {}
    ),
    ...(documentData.frequency && documentData.frequency !== 'none' && { frequency: documentData.frequency }),
    drawing_info: {
      ...(documentData.date_issued && { date_issued: documentData.date_issued }),
      ...(documentData.drawing_status && { drawing_status: documentData.drawing_status }),
      ...(documentData.prepared_by && { prepared_by: documentData.prepared_by }),
      ...(documentData.drawing_scale && { drawing_scale: documentData.drawing_scale }),
      ...(documentData.approved_by_user && { approved_by_user: documentData.approved_by_user }),
      ...(documentData.related_drawings && { related_drawings: documentData.related_drawings })
    },
    access_control: {
      access_level: documentData.access_level || 'internal',
      access_users: documentData.access_users || []
    },
    tenant_id: req.tenant.tenantId,
    created_by: currentUser && currentUser.userEmail ? {
      user_id: currentUser.userId,
      ...(currentUser.userName && { user_name: currentUser.userName }),
      email: currentUser.userEmail
    } : undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Build location payload for document
 * @param {Object} documentPayload - Document payload to modify
 * @param {Object} documentData - Document data
 * @private
 */
function buildLocationPayload(documentPayload, documentData) {
  if (documentData.site_id) {
    documentPayload.location.site = { site_id: documentData.site_id };
  }
  if (documentData.building_id) {
    documentPayload.location.building = { building_id: documentData.building_id };
  }
  if (documentData.floor_id) {
    documentPayload.location.floor = { floor_id: documentData.floor_id };
  }
  if (documentData.tenant_id) {
    documentPayload.location.tenant = { tenant_id: documentData.tenant_id };
  }
  if (documentData.vendor_id) {
    documentPayload.location.vendor = { vendor_id: documentData.vendor_id };
  }
}

/**
 * Send approval notifications for new document
 * @param {Object} documentData - Document data with approval config
 * @param {Object} document - Saved document
 * @param {Object} currentUser - Current user
 * @private
 */
function sendApprovalNotifications(documentData, document, currentUser) {
  if (documentData.approval_config?.enabled && documentData.approval_config.approvers?.length > 0) {
    const documentDetails = {
      name: document.name || document.file?.file_meta?.file_name || 'Unnamed Document',
      category: document.category,
      type: document.type,
      status: documentData.approval_config.status || 'Pending Approval',
      uploadedBy: currentUser?.userName || currentUser?.userEmail || 'Unknown',
      uploadedDate: new Date(),
      description: document.description
    };

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

    sendNotificationAsync(
      () => notificationService.notifyDocumentApproversAssigned(
        document,
        documentData.approval_config.approvers,
        {
          userId: currentUser?.userId,
          userName: currentUser?.userName,
          userEmail: currentUser?.userEmail
        },
        document.tenant_id
      ),
      `document_approver_notification_${document._id}`
    );
  }
}

/**
 * Send update notifications for document changes
 * @param {Object} oldDocument - Old document state
 * @param {Object} document - Updated document
 * @param {Object} req - Express request
 * @private
 */
function sendUpdateNotifications(oldDocument, document, req) {
  setImmediate(async () => {
    try {
      const userId = req.user?.userId || req.user?.sub || 'unknown';
      const userName = req.user?.name || req.user?.email || 'Unknown User';

      const mainStatusChanged = oldDocument && document.status && oldDocument.status !== document.status;
      const approvalStatusChanged = oldDocument?.approval_config?.status !== document?.approval_config?.status;

      if (mainStatusChanged || approvalStatusChanged) {
        const oldStatus = mainStatusChanged ? oldDocument.status : oldDocument?.approval_config?.status;
        const newStatus = mainStatusChanged ? document.status : document?.approval_config?.status;

        const recipients = [];

        if (document.created_by) {
          recipients.push({ user_id: document.created_by, user_email: document.created_by });
        }

        if (document.approval_config?.approvers) {
          document.approval_config.approvers.forEach(approver => {
            if (approver.user_email && approver.user_email !== userId) {
              recipients.push({ user_id: approver.user_id, user_email: approver.user_email });
            }
          });
        }

        const uniqueRecipients = recipients.filter((recipient, index, self) =>
          index === self.findIndex(r => r.user_email === recipient.user_email)
        );

        if (uniqueRecipients.length > 0) {
          sendNotificationAsync(
            () => notificationService.notifyDocumentStatusChanged(
              document,
              oldStatus,
              newStatus,
              uniqueRecipients,
              { user_id: userId, user_name: userName, user_email: req.user?.email || userId },
              document.tenant_id
            ),
            'document_status_changed'
          );
        }
      }

      const allApprovers = document?.approval_config?.approvers || [];
      if (allApprovers.length > 0) {
        sendNotificationAsync(
          () => notificationService.notifyDocumentApproversAssigned(
            document,
            allApprovers.map(approver => ({ user_id: approver.user_id, user_email: approver.user_email })),
            { user_id: userId, user_name: userName, user_email: req.user?.email || userId },
            document.tenant_id
          ),
          'document_approvers_assigned'
        );
      }
    } catch (notifError) {
      console.error('Failed to send document update notifications:', notifError);
    }
  });
}

/**
 * Clean object fields by removing "none" and empty values
 * @param {Object} obj - Object to clean
 * @returns {Object} - Cleaned object
 * @private
 */
function cleanObjectFields(obj) {
  const cleaned = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value && value !== 'none' && value !== '') {
      cleaned[key] = value;
    }
  });
  return Object.keys(cleaned).length > 0 ? cleaned : {};
}

/**
 * Get documents by type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getByType = async (req, res) => {
  try {
    const { search, page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    let filterQuery = { type: req.params.type };

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

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const documents = await Document.find(filterQuery)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalDocuments = await Document.countDocuments(filterQuery);

    const summary = {
      total_documents: totalDocuments,
      by_category: {}
    };

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
    console.error('Error in documentController.getByType:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by type',
      error: error.message
    });
  }
};

/**
 * Get documents by building
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getByBuilding = async (req, res) => {
  try {
    const { search, page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;

    if (!req.params.buildingId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid building ID format'
      });
    }

    let filterQuery = {
      'location.building.building_id': req.params.buildingId
    };

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

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

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
    console.error('Error in documentController.getByBuilding:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by building',
      error: error.message
    });
  }
};

/**
 * Get document summary statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSummaryStats = async (req, res) => {
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
    console.error('Error in documentController.getSummaryStats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document statistics',
      error: error.message
    });
  }
};

/**
 * Get storage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStorageStats = async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const matchStage = {
      'file.file_meta.file_size': { $exists: true, $ne: null },
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    const sizeAggregation = await Document.aggregate([
      { $match: matchStage },
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

    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

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
    console.error('Error in documentController.getStorageStats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching storage statistics',
      error: error.message
    });
  }
};

/**
 * Get documents grouped by category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getByCategory = async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;

    let matchQuery = {};
    if (customer_id) matchQuery['customer.customer_id'] = customer_id;
    if (site_id) matchQuery['location.site.site_id'] = site_id;
    if (building_id) matchQuery['location.building.building_id'] = building_id;

    // CRITICAL: Filter by tenant for multi-tenant data isolation
    if (req.tenant && req.tenant.tenantId && !req.tenant.bypassTenant) {
      matchQuery.tenant_id = req.tenant.tenantId;
    }

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

    const result = {};
    categoryStats.forEach(stat => {
      result[stat._id || 'Unknown'] = {
        count: stat.count,
        types: stat.types.filter(Boolean)
      };
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in documentController.getByCategory:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by category',
      error: error.message
    });
  }
};

/**
 * Get dropdown options for entities
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOptionsEntities = async (req, res) => {
  try {
    const { customer_id, site_id, building_id } = req.query;
    const Site = require('../models/Site');
    const Building = require('../models/Building');
    const Floor = require('../models/Floor');
    const BuildingTenant = require('../models/BuildingTenant');

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
    console.error('Error in documentController.getOptionsEntities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching entity options',
      error: error.message
    });
  }
};

/**
 * Get document comments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, skip = 0 } = req.query;
    const DocumentComment = require('../models/DocumentComment');

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
    console.error('Error in documentController.getComments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
};

/**
 * Export documents to CSV and upload to S3
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const exportCSV = async (req, res) => {
  try {
    const { customer_id, site_id, building_id, floor_id, tenant_id, category, type } = req.body;

    // Build filter query (ignore 'all' values)
    const filter = {};
    if (customer_id && customer_id !== 'all') filter['customer.customer_id'] = customer_id;
    if (site_id && site_id !== 'all') filter['location.site.site_id'] = site_id;
    if (building_id && building_id !== 'all') filter['location.building.building_id'] = building_id;
    if (floor_id && floor_id !== 'all') filter['location.floor.floor_id'] = floor_id;
    if (tenant_id && tenant_id !== 'all') filter['location.tenant.tenant_id'] = tenant_id;
    if (category && category !== 'all') filter.category = category;
    if (type && type !== 'all') filter.type = type;

    // Fetch documents
    const documents = await Document.find(filter)
      .select('name category type file location customer tags approval_status approval_config created_at updated_at')
      .lean();

    // Check if there are documents to export
    if (!documents || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents found to export',
        data: { total_records: 0 }
      });
    }

    // Populate entity names
    const enrichedDocuments = await entityLookupService.batchFetchEntityNames(documents, req.tenant.tenantId);

    // Transform data for CSV
    const csvData = enrichedDocuments.map(doc => ({
      'Document Name': doc.name || '',
      'Category': doc.category || '',
      'Type': doc.type || '',
      'File Type': doc.file?.file_meta?.file_extension || '',
      'File Size (bytes)': doc.file?.file_meta?.file_size || 0,
      'Customer': doc.customer?.customer_name || '',
      'Site': doc.location?.site?.site_name || '',
      'Building': doc.location?.building?.building_name || '',
      'Floor': doc.location?.floor?.floor_name || '',
      'Tenant': doc.location?.tenant?.tenant_name || '',
      'Assets': doc.location?.assets?.map(a => a.asset_name || a.asset_id).filter(Boolean).join(', ') || '',
      'Vendor': doc.location?.vendor?.vendor_name || '',
      'Approval Status': doc.approval_config?.status || doc.approval_status || '',
      'Approvers': doc.approval_config?.approvers?.map(a => a.user_name || a.user_email).filter(Boolean).join(', ') || '',
      'Tags': doc.tags?.tags?.join(', ') || '',
      'Created Date': doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-AU') : '',
      'Updated Date': doc.updated_at ? new Date(doc.updated_at).toLocaleDateString('en-AU') : ''
    }));

    // Define CSV fields
    const fields = [
      'Document Name', 'Category', 'Type', 'File Type', 'File Size (bytes)',
      'Customer', 'Site', 'Building', 'Floor', 'Tenant', 'Assets', 'Vendor',
      'Approval Status', 'Approvers', 'Tags', 'Created Date', 'Updated Date'
    ];

    // Generate CSV
    const { Parser } = require('json2csv');
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    // Upload CSV to S3
    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const filename = `exports/documents_export_${timestamp}_${date}.csv`;
    const csvBuffer = Buffer.from(csv, 'utf-8');

    const csvFile = {
      buffer: csvBuffer,
      originalname: filename.split('/').pop(),
      mimetype: 'text/csv',
      size: csvBuffer.length
    };

    const s3Result = await uploadFileToS3(csvFile, 'exports', `exports`);

    if (!s3Result.success) {
      throw new Error('Failed to upload CSV to S3: ' + s3Result.error);
    }

    // Generate presigned URL for download (expires in 1 hour)
    const presignedUrlResult = await generatePresignedUrl(s3Result.data.file_meta.file_key, 3600);

    if (!presignedUrlResult.success) {
      throw new Error('Failed to generate presigned URL: ' + presignedUrlResult.error);
    }

    res.status(200).json({
      success: true,
      message: `Successfully exported ${enrichedDocuments.length} documents`,
      data: {
        file_url: presignedUrlResult.url,
        file_name: filename.split('/').pop(),
        total_records: enrichedDocuments.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in documentController.exportCSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export documents',
      error: error.message
    });
  }
};

/**
 * Get documents pending approval
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPendingApproval = async (req, res) => {
  try {
    const { assigned_to, page = 1, limit = 20 } = req.query;

    const query = {
      approval_required: true,
      approval_status: 'Pending'
    };

    if (assigned_to) {
      query.approved_by = assigned_to;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Document.countDocuments(query);

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
    console.error('Error in documentController.getPendingApproval:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending approvals',
      error: error.message
    });
  }
};

/**
 * Get approval history for a document
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getApprovalHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const ApprovalHistory = require('../models/ApprovalHistory');

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

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
    console.error('Error in documentController.getApprovalHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching approval history',
      error: error.message
    });
  }
};

/**
 * Get version history for a document
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVersionHistory = async (req, res) => {
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
    console.error('Error in documentController.getVersionHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching version history',
      error: error.message
    });
  }
};

/**
 * Get all versions by document group ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVersionsByGroupId = async (req, res) => {
  try {
    const { documentGroupId } = req.params;

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
    console.error('Error in documentController.getVersionsByGroupId:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document versions',
      error: error.message
    });
  }
};

/**
 * Download specific version by version ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const downloadVersionById = async (req, res) => {
  try {
    const { versionId } = req.params;
    const TenantS3Service = require('../services/tenantS3Service');

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

    if (fileMeta.bucket_name && fileMeta.bucket_name !== process.env.AWS_BUCKET) {
      console.log(`Generating download URL for version in tenant bucket: ${fileMeta.bucket_name}`);
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePresignedUrlForTenantBucket(
        fileMeta.bucket_name,
        fileMeta.file_key,
        3600
      );
    } else {
      console.log('Generating download URL for version in shared bucket');
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
    console.error('Error in documentController.downloadVersionById:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading version',
      error: error.message
    });
  }
};

/**
 * Download specific version by sequence number
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const downloadVersionBySequence = async (req, res) => {
  try {
    const { id, versionSequence } = req.params;
    const versionSeq = parseInt(versionSequence);
    const Tenant = require('../models/Tenant');
    const TenantS3Service = require('../services/tenantS3Service');

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

    const currentVersionSequence = document.version_sequence || 1;
    if (versionSeq === currentVersionSequence) {
      fileToDownload = document.file;
      versionNumber = document.version_number || document.version;
    } else {
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
    let bucketName = fileMeta.bucket_name;

    if (!bucketName) {
      const tenantId = document.tenant_id;
      if (tenantId) {
        try {
          const tenant = await Tenant.findById(tenantId);
          if (tenant && tenant.s3_bucket_name && tenant.s3_bucket_status === 'created') {
            bucketName = tenant.s3_bucket_name;
          } else {
            bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
          }
        } catch (error) {
          console.error('Error fetching tenant for version:', error.message);
          bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
        }
      } else {
        bucketName = process.env.AWS_BUCKET || 'dev-saas-common';
      }
    }

    if (bucketName && bucketName !== process.env.AWS_BUCKET) {
      const tenantS3Service = new TenantS3Service();
      urlResult = await tenantS3Service.generatePresignedUrlForTenantBucket(
        bucketName,
        fileMeta.file_key,
        3600
      );
    } else {
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
    console.error('Error in documentController.downloadVersionBySequence:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading version',
      error: error.message
    });
  }
};

/**
 * Submit a review for a document
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const submitReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment, user_id, user_name, user_email } = req.body;
    const DocumentComment = require('../models/DocumentComment');
    const emailService = require('../utils/emailService');
    const notificationService = require('../utils/notificationService');
    const { sendNotificationAsync, sendEmailAsync } = require('../utils/asyncHelpers');
    const { logUpdate } = require('../utils/auditLogger');

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

    // Track previous status
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

      // Log audit
      const documentName = document.name || document.file?.file_meta?.file_name || 'Document';
      logUpdate({ module: 'document', resourceName: `${documentName} - reviewed (${status})`, req, moduleId: document._id, resource: document.toObject() });
    }

    // Send notifications asynchronously
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

      // Build recipient list
      const allRecipients = [];

      if (document.created_by?.email) {
        allRecipients.push({
          user_id: document.created_by.user_id || document.created_by.email.toLowerCase(),
          user_email: document.created_by.email.toLowerCase(),
          user_name: document.created_by.user_name || document.created_by.email
        });
      }

      if (document.approval_config?.approvers) {
        for (const approver of document.approval_config.approvers) {
          if (!allRecipients.find(r => r.user_email === approver.user_email.toLowerCase())) {
            allRecipients.push({
              user_id: approver.user_id || approver.user_email.toLowerCase(),
              user_email: approver.user_email.toLowerCase(),
              user_name: approver.user_name || approver.user_email
            });
          }
        }
      }

      // Exclude current user
      const recipients = allRecipients.filter(r =>
        r.user_email.toLowerCase() !== user_email.toLowerCase()
      );

      // Send emails
      for (const recipient of recipients) {
        try {
          sendEmailAsync(
            () => emailService.sendDocumentUpdate({
              to: recipient.user_email,
              documentId: id,
              creatorName: recipient.user_name,
              documentDetails,
              statusUpdate
            }),
            `document_update_email_${recipient.user_email}`
          );
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
      }

      // Send in-app notifications
      if (recipients.length > 0) {
        if (statusChanged) {
          sendNotificationAsync(
            () => notificationService.notifyDocumentStatusChanged(
              document,
              previousStatus,
              status,
              recipients,
              { user_id: user_id || 'unknown', user_name: user_name || user_email, user_email: user_email },
              document.tenant_id
            ),
            'document_status_changed_comment'
          );
        } else {
          sendNotificationAsync(
            () => notificationService.notifyDocumentCommentAdded(
              document,
              { _id: documentComment._id, user_id: user_id || 'unknown', user_name: user_name || user_email, user_email: user_email, comment: comment },
              recipients,
              document.tenant_id
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
    console.error('Error in documentController.submitReview:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting review',
      error: error.message
    });
  }
};

/**
 * Request approval for a document
 * POST /api/documents/:id/request-approval
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const requestApproval = async (req, res) => {
  const ApprovalHistory = require('../models/ApprovalHistory');
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
    console.error('Error in documentController.requestApproval:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting approval',
      error: error.message
    });
  }
};

/**
 * Approve a document
 * PUT /api/documents/:id/approve
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const approve = async (req, res) => {
  const ApprovalHistory = require('../models/ApprovalHistory');
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
            user_email: result.created_by
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
              result.tenant_id
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
    console.error('Error in documentController.approve:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving document',
      error: error.message
    });
  }
};

/**
 * Reject a document
 * PUT /api/documents/:id/reject
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const reject = async (req, res) => {
  const ApprovalHistory = require('../models/ApprovalHistory');
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
            user_email: result.created_by
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
              result.tenant_id
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
    console.error('Error in documentController.reject:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting document',
      error: error.message
    });
  }
};

/**
 * Revoke/cancel approval request for a document
 * PUT /api/documents/:id/revoke-approval
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const revokeApproval = async (req, res) => {
  const ApprovalHistory = require('../models/ApprovalHistory');
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
    console.error('Error in documentController.revokeApproval:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking approval',
      error: error.message
    });
  }
};

/**
 * Helper function to calculate next version number
 * @param {string} currentVersion - Current version in X.Y format
 * @returns {string} Next version number
 */
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

/**
 * Upload new version of document
 * POST /api/documents/:id/versions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uploadVersion = async (req, res) => {
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
            currentDocument.tenant_id
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
    console.error('Error in documentController.uploadVersion:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading new version',
      error: error.message
    });
  }
};

/**
 * Restore a version from single-record version history
 * POST /api/documents/:id/restore-version
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const restoreVersion = async (req, res) => {
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

    // Log audit for version restore
    const documentName = document.name || document.file?.file_meta?.file_name || 'Document';
    logUpdate({ module: 'document', resourceName: `${documentName} - restored version ${versionToRestore.version_number}`, req, moduleId: document._id, resource: document.toObject() });

    res.status(200).json({
      success: true,
      message: `Version ${versionToRestore.version_number} restored as version ${newVersionNumber}`,
      data: document
    });

  } catch (error) {
    console.error('Error in documentController.restoreVersion:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring version',
      error: error.message
    });
  }
};

/**
 * Delete a version from single-record version history
 * DELETE /api/documents/:id/delete-version
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteVersion = async (req, res) => {
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

    // Remove the version from history
    document.version_history.splice(versionIndex, 1);

    // Update timestamps
    document.updated_at = new Date();

    // Save the document
    await document.save();

    // Log audit for version deletion
    const documentName = document.name || document.file?.file_meta?.file_name || 'Document';
    logUpdate({ module: 'document', resourceName: `${documentName} - deleted version ${versionToDelete.version_number}`, req, moduleId: document._id, resource: document.toObject() });

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
    console.error('Error in documentController.deleteVersion:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting version',
      error: error.message
    });
  }
};

/**
 * Restore old version as current (by version ID - for multi-document versioning)
 * POST /api/documents/versions/:versionId/restore
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const restoreVersionById = async (req, res) => {
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

    // Log audit for version restore as new document
    const documentName = restoredDocument.name || restoredDocument.file?.file_meta?.file_name || 'Document';
    logCreate({ module: 'document', resourceName: `${documentName} - restored from version ${versionToRestore.version_number}`, req, moduleId: restoredDocument._id, resource: restoredDocument.toObject() });

    res.status(200).json({
      success: true,
      message: `Version ${versionToRestore.version_number} restored as version ${newVersionNumber}`,
      data: restoredDocument
    });

  } catch (error) {
    console.error('Error in documentController.restoreVersionById:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring version',
      error: error.message
    });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  bulkRemove,
  bulkUpdate,
  getTags,
  getStats,
  getPreviewUrl,
  getDownloadUrl,
  getByType,
  getByBuilding,
  getSummaryStats,
  getStorageStats,
  getByCategory,
  getOptionsEntities,
  getComments,
  exportCSV,
  getPendingApproval,
  getApprovalHistory,
  getVersionHistory,
  getVersionsByGroupId,
  downloadVersionById,
  downloadVersionBySequence,
  submitReview,
  requestApproval,
  approve,
  reject,
  revokeApproval,
  uploadVersion,
  restoreVersion,
  deleteVersion,
  restoreVersionById
};
