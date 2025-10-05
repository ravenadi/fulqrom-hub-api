const express = require('express');
const multer = require('multer');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const Document = require('../models/Document');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');
const { uploadFileToS3, generatePresignedUrl, generatePreviewUrl, deleteFileFromS3 } = require('../utils/s3Upload');
const {
  validateCreateDocument,
  validateUpdateDocument,
  validateQueryParams,
  validateObjectId
} = require('../middleware/documentValidation');
const {
  buildSearchQuery,
  buildPagination,
  buildSort,
  isValidObjectId,
  buildApiResponse,
  handleError,
  sanitizeQuery
} = require('../middleware/searchHelpers');

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
    // Fetch customer name
    if (documentData.customer_id) {
      // Ensure we're using string ID, not ObjectId
      const customerId = documentData.customer_id.toString();
      const customer = await Customer.findById(customerId);
      if (customer) {
        entityNames.customer_name = customer.organisation?.organisation_name ||
                                   customer.company_profile?.trading_name ||
                                   customer.company_profile?.organisation_name ||
                                   'Unknown Customer';
      }
    }

    // Fetch site name
    if (documentData.site_id) {
      const site = await Site.findById(documentData.site_id.toString());
      if (site) {
        entityNames.site_name = site.site_name;
      }
    }

    // Fetch building name
    if (documentData.building_id) {
      const building = await Building.findById(documentData.building_id.toString());
      if (building) {
        entityNames.building_name = building.building_name;
      }
    }

    // Fetch floor name
    if (documentData.floor_id) {
      const floor = await Floor.findById(documentData.floor_id.toString());
      if (floor) {
        entityNames.floor_name = floor.floor_name;
      }
    }

    // Fetch asset name
    if (documentData.asset_id) {
      const asset = await Asset.findById(documentData.asset_id.toString());
      if (asset) {
        // Build asset name from available fields
        entityNames.asset_name = asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset';
        entityNames.asset_type = asset.type || asset.category;
      } else {
        // Asset not found, use default name
        entityNames.asset_name = `Asset ${documentData.asset_id}`;
      }
    }

    // Fetch tenant name
    if (documentData.tenant_id) {
      const tenant = await Tenant.findById(documentData.tenant_id.toString());
      if (tenant) {
        entityNames.tenant_name = tenant.tenant_name;
      }
    }

    // Fetch vendor name
    if (documentData.vendor_id) {
      const vendor = await Vendor.findById(documentData.vendor_id.toString());
      if (vendor) {
        entityNames.vendor_name = vendor.contractor_name;
      }
    }
  } catch (error) {
    console.warn('Error fetching entity names:', error.message);
  }

  return entityNames;
}

// GET /api/documents - List all documents with advanced search and filtering
router.get('/', validateQueryParams, async (req, res) => {
  try {
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
      tags,
      search,
      page = 1,
      limit = 50,
      sort = 'created_at',
      order = 'desc'
    } = sanitizedQuery;

    // Build filter query
    let filterQuery = {};

    // Entity filters
    if (customer_id) filterQuery['customer.customer_id'] = customer_id;
    if (site_id) filterQuery['location.site.site_id'] = site_id;
    if (building_id) filterQuery['location.building.building_id'] = building_id;
    if (floor_id) filterQuery['location.floor.floor_id'] = floor_id;
    if (asset_id) filterQuery['location.asset.asset_id'] = asset_id;
    if (tenant_id) filterQuery['location.tenant.tenant_id'] = tenant_id;
    if (vendor_id) filterQuery['location.vendor.vendor_id'] = vendor_id;

    // Document filters
    if (category) filterQuery.category = category;
    if (type) filterQuery.type = type;
    if (status) filterQuery.status = status;
    if (engineering_discipline) filterQuery.engineering_discipline = engineering_discipline;

    // Compliance filters
    if (regulatory_framework) filterQuery['metadata.regulatory_framework'] = regulatory_framework;
    if (compliance_status) filterQuery['metadata.compliance_status'] = compliance_status;

    // Drawing Register filters
    if (drawing_status) filterQuery['drawing_info.drawing_status'] = drawing_status;
    if (prepared_by) filterQuery['drawing_info.prepared_by'] = prepared_by;
    if (approved_by_user) filterQuery['drawing_info.approved_by_user'] = approved_by_user;

    // Access Control filters
    if (access_level) filterQuery['access_control.access_level'] = access_level;

    // Tags filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filterQuery['tags.tags'] = { $in: tagArray };
    }

    // Advanced search
    const searchQuery = buildSearchQuery(search);
    if (Object.keys(searchQuery).length > 0) {
      filterQuery = { ...filterQuery, ...searchQuery };
    }

    // Pagination and sorting
    const pagination = buildPagination(page, limit);
    const sortObj = buildSort(sort, order);

    // Execute queries in parallel for better performance
    const [documents, totalDocuments, categoryStats] = await Promise.all([
      Document.find(filterQuery)
        .sort(sortObj)
        .skip(pagination.skip)
        .limit(pagination.limitNum)
        .lean() // Performance optimization - returns plain JS objects
        .exec(),
      Document.countDocuments(filterQuery).exec(),
      Document.aggregate([
        { $match: filterQuery },
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

    // Build category summary
    const documentsByCategory = {};
    categoryStats.forEach(stat => {
      documentsByCategory[stat._id || 'Unknown'] = stat.count;
    });

    // Build response
    const response = buildApiResponse(
      true,
      documents,
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

// GET /api/documents/:id - Get single document
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      error: error.message
    });
  }
});

// GET /api/documents/:id/download - Generate presigned URL for file download
router.get('/:id/download', async (req, res) => {
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

    // Generate presigned URL
    const urlResult = await generatePresignedUrl(document.file.file_meta.file_key, 3600); // 1 hour expiry

    if (!urlResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate download URL',
        error: urlResult.error
      });
    }

    res.status(200).json({
      success: true,
      download_url: urlResult.url,
      expires_in: 3600,
      file_name: document.file.file_meta.file_name
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating download URL',
      error: error.message
    });
  }
});

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

    // Generate preview URL with inline content disposition
    const urlResult = await generatePreviewUrl(
      fileMeta.file_key,
      fileMeta.file_name,
      fileMeta.file_type,
      3600 // 1 hour expiry
    );

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
router.post('/', upload.single('file'), validateCreateDocument, async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File upload is required'
      });
    }

    // Use validated data from middleware
    const documentData = req.validatedData;

    // Fetch entity names using IDs
    const entityNames = await fetchEntityNames(documentData);

    // Upload file to S3
    const uploadResult = await uploadFileToS3(req.file, documentData.customer_id);

    if (!uploadResult.success) {
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: uploadResult.error
      });
    }

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

      // Customer information
      customer: {
        customer_id: documentData.customer_id,
        customer_name: entityNames.customer_name
      },

      // Location associations
      location: {},

      // Compliance metadata - category restriction removed, allow for all documents
      metadata: {
        ...(documentData.engineering_discipline && documentData.engineering_discipline !== 'none' && { engineering_discipline: documentData.engineering_discipline }),
        ...(documentData.regulatory_framework && documentData.regulatory_framework !== 'none' && { regulatory_framework: documentData.regulatory_framework }),
        ...(documentData.certification_number && documentData.certification_number !== 'none' && { certification_number: documentData.certification_number }),
        ...(documentData.compliance_framework && documentData.compliance_framework !== 'none' && { compliance_framework: documentData.compliance_framework }),
        ...(documentData.compliance_status && documentData.compliance_status !== 'none' && { compliance_status: documentData.compliance_status }),
        ...(documentData.issue_date && documentData.issue_date !== 'none' && { issue_date: documentData.issue_date }),
        ...(documentData.expiry_date && documentData.expiry_date !== 'none' && { expiry_date: documentData.expiry_date }),
        ...(documentData.review_date && documentData.review_date !== 'none' && { review_date: documentData.review_date })
      },

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

      // Approval workflow
      approval_required: documentData.approval_required || false,
      approved_by: documentData.approved_by,
      approval_status: documentData.approval_status || 'Pending',

      // Audit fields
      created_by: documentData.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add location associations if IDs are provided
    if (documentData.site_id) {
      documentPayload.location.site = {
        site_id: documentData.site_id,
        ...(entityNames.site_name && { site_name: entityNames.site_name })
      };
    }

    if (documentData.building_id) {
      documentPayload.location.building = {
        building_id: documentData.building_id,
        ...(entityNames.building_name && { building_name: entityNames.building_name })
      };
    }

    if (documentData.floor_id) {
      documentPayload.location.floor = {
        floor_id: documentData.floor_id,
        ...(entityNames.floor_name && { floor_name: entityNames.floor_name })
      };
    }

    if (documentData.asset_id) {
      documentPayload.location.asset = {
        asset_id: documentData.asset_id,
        ...(entityNames.asset_name && { asset_name: entityNames.asset_name }),
        ...(entityNames.asset_type && { asset_type: entityNames.asset_type })
      };
    }

    if (documentData.tenant_id) {
      documentPayload.location.tenant = {
        tenant_id: documentData.tenant_id,
        ...(entityNames.tenant_name && { tenant_name: entityNames.tenant_name })
      };
    }

    if (documentData.vendor_id) {
      documentPayload.location.vendor = {
        vendor_id: documentData.vendor_id,
        ...(entityNames.vendor_name && { vendor_name: entityNames.vendor_name })
      };
    }

    // Create document
    const document = new Document(documentPayload);
    await document.save();

    // Set document_group_id to the document's own ID after creation
    document.document_group_id = document._id.toString();
    await document.save();

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: document
    });

  } catch (error) {
    console.error('Document creation error:', error);
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

    // Build location update object
    const locationUpdate = {};

    if (updates.site_id) {
      locationUpdate['location.site'] = {
        site_id: updates.site_id,
        ...(entityNames.site_name && { site_name: entityNames.site_name })
      };
    }

    if (updates.building_id) {
      locationUpdate['location.building'] = {
        building_id: updates.building_id,
        ...(entityNames.building_name && { building_name: entityNames.building_name })
      };
    }

    if (updates.floor_id) {
      locationUpdate['location.floor'] = {
        floor_id: updates.floor_id,
        ...(entityNames.floor_name && { floor_name: entityNames.floor_name })
      };
    }

    if (updates.asset_id) {
      locationUpdate['location.asset'] = {
        asset_id: updates.asset_id,
        ...(entityNames.asset_name && { asset_name: entityNames.asset_name }),
        ...(entityNames.asset_type && { asset_type: entityNames.asset_type })
      };
    }

    if (updates.tenant_id) {
      locationUpdate['location.tenant'] = {
        tenant_id: updates.tenant_id,
        ...(entityNames.tenant_name && { tenant_name: entityNames.tenant_name })
      };
    }

    if (updates.vendor_id) {
      locationUpdate['location.vendor'] = {
        vendor_id: updates.vendor_id,
        ...(entityNames.vendor_name && { vendor_name: entityNames.vendor_name })
      };
    }

    // Add updated_at timestamp
    locationUpdate.updated_at = new Date().toISOString();

    // Perform bulk update
    const result = await Document.updateMany(
      { _id: { $in: document_ids } },
      { $set: locationUpdate }
    );

    res.status(200).json({
      success: true,
      message: 'Documents updated successfully',
      matched_count: result.matchedCount,
      modified_count: result.modifiedCount,
      document_ids: document_ids
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating documents',
      error: error.message
    });
  }
});

// PUT /api/documents/:id - Update document
router.put('/:id', validateObjectId, async (req, res) => {
  try {
    const updateData = { ...req.body };
    updateData.updated_at = new Date().toISOString();

    // Clean metadata: remove "none" values and empty fields
    if (updateData.metadata) {
      const cleanedMetadata = {};
      Object.keys(updateData.metadata).forEach(key => {
        const value = updateData.metadata[key];
        if (value && value !== 'none' && value !== '') {
          cleanedMetadata[key] = value;
        }
      });
      updateData.metadata = Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : {};
    }

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

    const document = await Document.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: document
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating document',
      error: error.message
    });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Delete file from S3 if exists
    if (document.file && document.file.file_meta && document.file.file_meta.file_key) {
      const deleteResult = await deleteFileFromS3(document.file.file_meta.file_key);
      if (!deleteResult.success) {
        console.warn('Failed to delete file from S3:', deleteResult.error);
      }
    }

    // Delete document from database
    await Document.findByIdAndDelete(req.params.id);

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
    console.error('Error fetching documents by type:', error);
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
    console.error('Error fetching documents by building:', error);
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

// GET /api/storage/stats - Get S3 storage statistics
router.get('/storage/stats', async (req, res) => {
  try {
    // Configure S3 Client (reuse configuration from s3Upload.js)
    const s3Client = new S3Client({
      region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'true'
    });

    const bucketName = process.env.AWS_BUCKET;

    if (!bucketName) {
      return res.status(500).json({
        success: false,
        message: 'S3 bucket not configured'
      });
    }

    let totalSize = 0;
    let objectCount = 0;
    let continuationToken = null;

    // List all objects in the bucket and sum their sizes
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken
      });

      const response = await s3Client.send(listCommand);

      if (response.Contents) {
        for (const object of response.Contents) {
          totalSize += object.Size || 0;
          objectCount++;
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Convert bytes to MB and GB
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

    res.status(200).json({
      success: true,
      data: {
        totalSizeBytes: totalSize,
        totalSizeMB: parseFloat(totalSizeMB),
        totalSizeGB: parseFloat(totalSizeGB),
        displaySize: displaySize,
        objectCount: objectCount
      }
    });

  } catch (error) {
    console.error('S3 Storage Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching S3 storage statistics',
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
      .limit(100)
      .lean();

    options.floors = floors.map(floor => ({
      id: floor._id.toString(),
      name: floor.floor_name,
      building_id: floor.building_id?.toString()
    }));

    // Get tenants (filtered by building if provided)
    const tenantFilter = building_id ? { building_id } : {};
    const tenants = await Tenant.find(tenantFilter, '_id tenant_name building_id')
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
    console.error('Error requesting approval:', error);
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
    console.error('Error approving document:', error);
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
    console.error('Error rejecting document:', error);
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
    console.error('Error revoking approval:', error);
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
    console.error('Error fetching pending approvals:', error);
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
    console.error('Error fetching approval history:', error);
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

    // Calculate new version number
    const currentVersionNumber = currentDocument.version_number || currentDocument.version || '1.0';
    const newVersionNumber = req.body.version_number || calculateNextVersion(currentVersionNumber);

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

    // Upload new file to S3 with versioned key
    const versionedFileName = `v${newVersionNumber}_${req.file.originalname}`;
    const uploadResult = await uploadFileToS3(
      { ...req.file, originalname: versionedFileName },
      currentDocument.customer.customer_id,
      `documents/${documentGroupId}`
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload file to S3',
        code: 'S3_UPLOAD_ERROR',
        error: uploadResult.error
      });
    }

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

    // Create new version document
    const newVersionData = {
      ...currentDocument.toObject(),
      _id: undefined, // Let MongoDB generate new ID
      document_group_id: documentGroupId,
      version_number: newVersionNumber,
      is_current_version: true,
      version_sequence: newVersionSequence,
      version: newVersionNumber, // Also update legacy version field
      file: uploadResult.data,
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const newVersionDocument = new Document(newVersionData);
    await newVersionDocument.save();

    res.status(200).json({
      success: true,
      message: 'New version uploaded successfully',
      data: newVersionDocument
    });

  } catch (error) {
    console.error('Error uploading new version:', error);
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
    console.error('Error fetching document versions:', error);
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

    // Generate presigned URL
    const urlResult = await generatePresignedUrl(document.file.file_meta.file_key, 3600);

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
    console.error('Error downloading version:', error);
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

    // Create new document as restored version
    const restoredVersionData = {
      ...versionToRestore.toObject(),
      _id: undefined, // Let MongoDB generate new ID
      version_number: newVersionNumber,
      version: newVersionNumber,
      is_current_version: true,
      version_sequence: newVersionSequence,
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
    console.error('Error restoring version:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring version',
      error: error.message
    });
  }
});

module.exports = router;