const express = require('express');
const multer = require('multer');
const Document = require('../models/Document');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Tenant = require('../models/Tenant');
const { uploadFileToS3, generatePresignedUrl, deleteFileFromS3 } = require('../utils/s3Upload');
const {
  validateCreateDocument,
  validateUpdateDocument,
  validateQueryParams,
  validateObjectId
} = require('../middleware/documentValidation');

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

    // Fetch tenant name
    if (documentData.tenant_id) {
      const tenant = await Tenant.findById(documentData.tenant_id.toString());
      if (tenant) {
        entityNames.tenant_name = tenant.tenant_name;
      }
    }
  } catch (error) {
    console.warn('Error fetching entity names:', error.message);
  }

  return entityNames;
}

// GET /api/documents - List all documents
router.get('/', validateQueryParams, async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      tenant_id,
      category,
      type,
      engineering_discipline,
      regulatory_framework,
      compliance_status,
      tags,
      search,
      page = 1,
      limit = 50,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      filterQuery['customer.customer_id'] = customer_id;
    }

    if (site_id) {
      filterQuery['location.site.site_id'] = site_id;
    }

    if (building_id) {
      filterQuery['location.building.building_id'] = building_id;
    }

    if (floor_id) {
      filterQuery['location.floor.floor_id'] = floor_id;
    }

    if (tenant_id) {
      filterQuery['location.tenant.tenant_id'] = tenant_id;
    }

    if (category) {
      filterQuery.category = category;
    }

    if (type) {
      filterQuery.type = type;
    }

    if (engineering_discipline) {
      filterQuery.engineering_discipline = engineering_discipline;
    }

    if (regulatory_framework) {
      filterQuery['metadata.regulatory_framework'] = regulatory_framework;
    }

    if (compliance_status) {
      filterQuery['metadata.compliance_status'] = compliance_status;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filterQuery['tags.tags'] = { $in: tagArray };
    }

    // Text search
    if (search) {
      filterQuery.$text = { $search: search };
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
      .limit(limitNum);

    const totalDocuments = await Document.countDocuments(filterQuery);

    // Calculate summary statistics
    const summary = await Document.aggregate([
      { $match: filterQuery },
      {
        $group: {
          _id: null,
          total_documents: { $sum: 1 },
          by_category: {
            $push: {
              category: '$category',
              type: '$type'
            }
          }
        }
      }
    ]);

    // Group by category
    const documentsByCategory = {};
    documents.forEach(doc => {
      const category = doc.category || 'Unknown';
      documentsByCategory[category] = (documentsByCategory[category] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      count: documents.length,
      total: totalDocuments,
      page: pageNum,
      pages: Math.ceil(totalDocuments / limitNum),
      summary: {
        total_documents: totalDocuments,
        documents_by_category: documentsByCategory
      },
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
      error: error.message
    });
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

      // Tags
      tags: documentData.tags ? { tags: Array.isArray(documentData.tags) ? documentData.tags : [documentData.tags] } : { tags: [] },

      // Customer information
      customer: {
        customer_id: documentData.customer_id,
        customer_name: entityNames.customer_name
      },

      // Location associations
      location: {},

      // Compliance metadata (only for compliance_regulatory category and only real values)
      metadata: documentData.category === 'compliance_regulatory' ? {
        ...(documentData.engineering_discipline && documentData.engineering_discipline !== 'none' && { engineering_discipline: documentData.engineering_discipline }),
        ...(documentData.regulatory_framework && documentData.regulatory_framework !== 'none' && { regulatory_framework: documentData.regulatory_framework }),
        ...(documentData.certification_number && documentData.certification_number !== 'none' && { certification_number: documentData.certification_number }),
        ...(documentData.compliance_framework && documentData.compliance_framework !== 'none' && { compliance_framework: documentData.compliance_framework }),
        ...(documentData.compliance_status && documentData.compliance_status !== 'none' && { compliance_status: documentData.compliance_status }),
        ...(documentData.issue_date && documentData.issue_date !== 'none' && { issue_date: documentData.issue_date }),
        ...(documentData.expiry_date && documentData.expiry_date !== 'none' && { expiry_date: documentData.expiry_date }),
        ...(documentData.review_date && documentData.review_date !== 'none' && { review_date: documentData.review_date })
      } : {},

      // Audit fields
      created_by: documentData.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add location associations if IDs are provided
    if (documentData.site_id && entityNames.site_name) {
      documentPayload.location.site = {
        site_id: documentData.site_id,
        site_name: entityNames.site_name
      };
    }

    if (documentData.building_id && entityNames.building_name) {
      documentPayload.location.building = {
        building_id: documentData.building_id,
        building_name: entityNames.building_name
      };
    }

    if (documentData.floor_id && entityNames.floor_name) {
      documentPayload.location.floor = {
        floor_id: documentData.floor_id,
        floor_name: entityNames.floor_name
      };
    }

    if (documentData.tenant_id && entityNames.tenant_name) {
      documentPayload.location.tenant = {
        tenant_id: documentData.tenant_id,
        tenant_name: entityNames.tenant_name
      };
    }

    // Create document
    const document = new Document(documentPayload);
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

// GET /api/documents/by-type/:type - Get documents by type
router.get('/by-type/:type', async (req, res) => {
  try {
    const documents = await Document.find({
      type: req.params.type
    }).sort({ created_at: -1 });

    const summary = {
      total_documents: documents.length,
      by_category: {}
    };

    // Group by category
    documents.forEach(doc => {
      const category = doc.category || 'Unknown';
      summary.by_category[category] = (summary.by_category[category] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      count: documents.length,
      document_type: req.params.type,
      summary,
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by type',
      error: error.message
    });
  }
});

// GET /api/documents/by-building/:buildingId - Get documents by building
router.get('/by-building/:buildingId', async (req, res) => {
  try {
    const documents = await Document.find({
      'location.building.building_id': req.params.buildingId
    }).sort({ category: 1, created_at: -1 });

    const summary = {
      total_documents: documents.length,
      by_category: {}
    };

    // Group by category
    documents.forEach(doc => {
      const category = doc.category || 'Unknown';
      summary.by_category[category] = (summary.by_category[category] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      count: documents.length,
      summary,
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching documents by building',
      error: error.message
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

module.exports = router;