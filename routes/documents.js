const express = require('express');
const Document = require('../models/Document');

const router = express.Router();

// GET /api/documents - List all documents
router.get('/', async (req, res) => {
  try {
    const {
      customer_id,
      site_id,
      building_id,
      floor_id,
      document_type,
      category,
      status,
      approval_status,
      engineering_discipline,
      uploaded_by,
      is_active,
      is_archived,
      search
    } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      filterQuery.customer_id = customer_id;
    }

    if (site_id) {
      filterQuery.site_id = site_id;
    }

    if (building_id) {
      filterQuery.building_id = building_id;
    }

    if (floor_id) {
      filterQuery.floor_id = floor_id;
    }

    if (document_type) {
      filterQuery.document_type = document_type;
    }

    if (category) {
      filterQuery.category = category;
    }

    if (status) {
      filterQuery.status = status;
    }

    if (approval_status) {
      filterQuery.approval_status = approval_status;
    }

    if (engineering_discipline) {
      filterQuery.engineering_discipline = engineering_discipline;
    }

    if (uploaded_by) {
      filterQuery.uploaded_by = new RegExp(uploaded_by, 'i');
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    if (is_archived !== undefined) {
      filterQuery.is_archived = is_archived === 'true';
    }

    // Text search
    if (search) {
      filterQuery.$text = { $search: search };
    }

    const documents = await Document.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name address')
      .populate('building_id', 'building_name building_code')
      .populate('floor_id', 'floor_name floor_number')
      .populate('asset_id', 'asset_name asset_code')
      .sort({ uploaded_date: -1 });

    // Calculate summary statistics
    const totalDocuments = documents.length;
    const approvedDocuments = documents.filter(doc => doc.approval_status === 'Approved').length;
    const underReviewDocuments = documents.filter(doc => doc.status === 'Under Review').length;
    const draftDocuments = documents.filter(doc => doc.status === 'Draft').length;
    const archivedDocuments = documents.filter(doc => doc.is_archived === true).length;

    // Group by document type
    const documentsByType = {};
    documents.forEach(doc => {
      const type = doc.document_type || 'Unknown';
      documentsByType[type] = (documentsByType[type] || 0) + 1;
    });

    // Group by category
    const documentsByCategory = {};
    documents.forEach(doc => {
      const category = doc.category || 'Unknown';
      documentsByCategory[category] = (documentsByCategory[category] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      count: totalDocuments,
      summary: {
        total_documents: totalDocuments,
        approved_documents: approvedDocuments,
        under_review_documents: underReviewDocuments,
        draft_documents: draftDocuments,
        archived_documents: archivedDocuments,
        documents_by_type: documentsByType,
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
router.get('/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number')
      .populate('site_id', 'site_name address status')
      .populate('building_id', 'building_name building_code category')
      .populate('floor_id', 'floor_name floor_number floor_type')
      .populate('asset_id', 'asset_name asset_code category');

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

// POST /api/documents - Create new document
router.post('/', async (req, res) => {
  try {
    const document = new Document(req.body);
    await document.save();

    // Populate the created document before returning
    await document.populate('customer_id', 'organisation.organisation_name');
    await document.populate('site_id', 'site_name address');
    await document.populate('building_id', 'building_name building_code');
    await document.populate('floor_id', 'floor_name floor_number');
    await document.populate('asset_id', 'asset_name asset_code');

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: document
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating document',
      error: error.message
    });
  }
});

// PUT /api/documents/:id - Update document
router.put('/:id', async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      req.body,
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

// GET /api/documents/by-type/:type - Get documents by type
router.get('/by-type/:type', async (req, res) => {
  try {
    const documents = await Document.find({
      document_type: req.params.type,
      is_active: true
    })
      .populate('customer_id', 'organisation.organisation_name')
      .populate('building_id', 'building_name')
      .sort({ uploaded_date: -1 });

    const summary = {
      total_documents: documents.length,
      approved: documents.filter(d => d.approval_status === 'Approved').length,
      under_review: documents.filter(d => d.status === 'Under Review').length,
      draft: documents.filter(d => d.status === 'Draft').length
    };

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
    const documents = await Document.find({ building_id: req.params.buildingId })
      .populate('customer_id', 'organisation.organisation_name')
      .populate('site_id', 'site_name')
      .populate('floor_id', 'floor_name floor_number')
      .sort({ category: 1, uploaded_date: -1 });

    const summary = {
      total_documents: documents.length,
      approved: documents.filter(d => d.approval_status === 'Approved').length,
      under_review: documents.filter(d => d.status === 'Under Review').length,
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
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

    const stats = await Document.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          approvedDocuments: {
            $sum: { $cond: [{ $eq: ['$approval_status', 'Approved'] }, 1, 0] }
          },
          underReviewDocuments: {
            $sum: { $cond: [{ $eq: ['$status', 'Under Review'] }, 1, 0] }
          },
          draftDocuments: {
            $sum: { $cond: [{ $eq: ['$status', 'Draft'] }, 1, 0] }
          },
          archivedDocuments: {
            $sum: { $cond: [{ $eq: ['$is_archived', true] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalDocuments: 0,
      approvedDocuments: 0,
      underReviewDocuments: 0,
      draftDocuments: 0,
      archivedDocuments: 0
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
    if (customer_id) matchQuery.customer_id = mongoose.Types.ObjectId(customer_id);
    if (site_id) matchQuery.site_id = mongoose.Types.ObjectId(site_id);
    if (building_id) matchQuery.building_id = mongoose.Types.ObjectId(building_id);

    const categoryStats = await Document.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$approval_status', 'Approved'] }, 1, 0] }
          },
          draftCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Draft'] }, 1, 0] }
          },
          underReviewCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Under Review'] }, 1, 0] }
          }
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

module.exports = router;