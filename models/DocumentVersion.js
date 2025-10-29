const mongoose = require('mongoose');
const tenantPlugin = require('../plugins/tenantPlugin');

// File metadata schema (reuse from Document model)
const FileMetaSchema = new mongoose.Schema({
  file_name: {
    type: String,
    required: true,
    trim: true
  },
  file_size: {
    type: Number,
    required: true
  },
  file_type: {
    type: String,
    required: true,
    trim: true
  },
  file_extension: {
    type: String,
    required: true,
    trim: true
  },
  file_url: {
    type: String,
    trim: true
  },
  file_path: {
    type: String,
    trim: true
  },
  file_key: {
    type: String,
    trim: true
  },
  bucket_name: {
    type: String,
    trim: true
  },
  version: {
    type: String,
    default: '1.0',
    trim: true
  },
  file_mime_type: {
    type: String,
    trim: true
  }
}, { _id: false });

// File container schema
const FileSchema = new mongoose.Schema({
  file_meta: FileMetaSchema
}, { _id: false });

// Version metadata schema
const VersionMetadataSchema = new mongoose.Schema({
  uploaded_by: {
    user_id: {
      type: String,
      trim: true
    },
    user_name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true
    }
  },
  upload_timestamp: {
    type: Date,
    default: Date.now
  },
  change_notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  superseded_version: {
    type: String,
    trim: true
  },
  file_changes: {
    original_filename: {
      type: String,
      trim: true
    },
    file_size_bytes: {
      type: Number
    },
    file_hash: {
      type: String,
      trim: true
    }
  }
}, { _id: false });

/**
 * DocumentVersion Schema
 * Stores historical file versions for documents
 * - Each document can have multiple file versions (same document record, different files)
 * - Current/latest file is stored in Document collection
 * - Historical files are archived here
 */
const DocumentVersionSchema = new mongoose.Schema({
  // Reference to the parent document
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },

  // Version tracking
  version_number: {
    type: String,
    required: true,
    trim: true
  },
  version_sequence: {
    type: Number,
    required: true
  },

  // Archived file data from parent document
  file: FileSchema,

  // Version metadata: who, when, what
  version_metadata: VersionMetadataSchema,

  // Tenant isolation (required for multi-tenancy)
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: false // Using custom timestamp from version_metadata.upload_timestamp
});

// Indexes for query performance
DocumentVersionSchema.index({ document_id: 1, version_sequence: -1 });
DocumentVersionSchema.index({ document_id: 1, version_number: 1 });
DocumentVersionSchema.index({ tenant_id: 1 });

// Apply tenant plugin for automatic tenant filtering
DocumentVersionSchema.plugin(tenantPlugin);

// Auto-populate document reference (optional, but can be useful)
DocumentVersionSchema.set('toJSON', { virtuals: true });
DocumentVersionSchema.set('toObject', { virtuals: true });

const DocumentVersion = mongoose.model('DocumentVersion', DocumentVersionSchema);

module.exports = DocumentVersion;

