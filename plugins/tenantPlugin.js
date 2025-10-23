/**
 * Mongoose Tenant Plugin
 *
 * This plugin adds automatic tenant isolation to Mongoose models.
 * It ensures that all queries are automatically scoped to the current tenant,
 * preventing data leakage between organizations.
 *
 * Features:
 * - Auto-adds tenant_id to all find/update/delete queries
 * - Provides tenant-scoped query methods
 * - Supports bypassing tenant filter for super admin operations
 * - Prevents cross-tenant data access
 */

const mongoose = require('mongoose');

/**
 * Tenant isolation plugin for Mongoose schemas
 *
 * @param {mongoose.Schema} schema - The Mongoose schema to apply the plugin to
 * @param {Object} options - Plugin options
 * @param {boolean} options.autoFilter - Enable automatic tenant filtering (default: true)
 * @param {boolean} options.required - Make tenant_id required (default: true)
 */
function tenantPlugin(schema, options = {}) {
  const {
    autoFilter = true,
    required = true
  } = options;

  // Skip if schema already has the plugin applied
  if (schema.statics._hasTenantPlugin) {
    return;
  }

  // Add tenant_id field to schema if not already present
  if (!schema.paths.tenant_id) {
    schema.add({
      tenant_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: required,
        index: true
      }
    });

    // Add compound indexes for common queries
    schema.index({ tenant_id: 1, createdAt: -1 });
    schema.index({ tenant_id: 1, is_active: 1 });
  }

  // Mark schema as having the plugin
  schema.statics._hasTenantPlugin = true;

  if (!autoFilter) {
    // If auto-filtering is disabled, just add the field and exit
    return;
  }

  // ==========================================
  // QUERY MIDDLEWARE - Auto-inject tenant_id
  // ==========================================

  /**
   * Pre-find middleware to automatically add tenant_id filter
   * Applies to: find, findOne, findOneAndUpdate, findOneAndDelete, etc.
   */
  const preFindMiddleware = function(next) {
    const query = this.getQuery();

    // Skip if explicitly told to bypass tenant filter
    if (this.getOptions()._bypassTenantFilter) {
      return next();
    }

    // Skip if tenant_id is already in the query (allows explicit tenant queries)
    if (query.tenant_id) {
      return next();
    }

    // Get tenant context from query options
    const tenantId = this.getOptions()._tenantId;

    if (tenantId) {
      // Add tenant_id to the query
      this.where({ tenant_id: tenantId });
    }

    next();
  };

  // Apply to all find operations
  schema.pre('find', preFindMiddleware);
  schema.pre('findOne', preFindMiddleware);
  schema.pre('findOneAndUpdate', preFindMiddleware);
  schema.pre('findOneAndDelete', preFindMiddleware);
  schema.pre('findOneAndRemove', preFindMiddleware);
  schema.pre('findOneAndReplace', preFindMiddleware);

  /**
   * Pre-update middleware to prevent cross-tenant updates
   */
  const preUpdateMiddleware = function(next) {
    const query = this.getQuery();

    // Skip if explicitly told to bypass tenant filter
    if (this.getOptions()._bypassTenantFilter) {
      return next();
    }

    // Skip if tenant_id is already in the query
    if (query.tenant_id) {
      return next();
    }

    // Get tenant context from query options
    const tenantId = this.getOptions()._tenantId;

    if (tenantId) {
      // Add tenant_id to the update filter
      this.where({ tenant_id: tenantId });
    }

    next();
  };

  // Apply to update operations
  schema.pre('updateOne', preUpdateMiddleware);
  schema.pre('updateMany', preUpdateMiddleware);
  schema.pre('update', preUpdateMiddleware);

  /**
   * Pre-delete middleware to prevent cross-tenant deletes
   */
  const preDeleteMiddleware = function(next) {
    const query = this.getQuery();

    // Skip if explicitly told to bypass tenant filter
    if (this.getOptions()._bypassTenantFilter) {
      return next();
    }

    // Skip if tenant_id is already in the query
    if (query.tenant_id) {
      return next();
    }

    // Get tenant context from query options
    const tenantId = this.getOptions()._tenantId;

    if (tenantId) {
      // Add tenant_id to the delete filter
      this.where({ tenant_id: tenantId });
    }

    next();
  };

  // Apply to delete operations
  schema.pre('deleteOne', preDeleteMiddleware);
  schema.pre('deleteMany', preDeleteMiddleware);
  schema.pre('remove', preDeleteMiddleware);

  /**
   * Pre-count middleware to ensure counts are tenant-scoped
   */
  schema.pre('countDocuments', preFindMiddleware);
  schema.pre('count', preFindMiddleware);

  // ==========================================
  // INSTANCE METHODS
  // ==========================================

  /**
   * Check if this document belongs to the specified tenant
   * @param {ObjectId|string} tenantId - The tenant ID to check
   * @returns {boolean} True if document belongs to tenant
   */
  schema.methods.belongsToTenant = function(tenantId) {
    return this.tenant_id && this.tenant_id.toString() === tenantId.toString();
  };

  // ==========================================
  // STATIC METHODS
  // ==========================================

  /**
   * Create a query scoped to a specific tenant
   * @param {ObjectId|string} tenantId - The tenant ID to scope to
   * @returns {Query} Mongoose query with tenant filter applied
   */
  schema.statics.byTenant = function(tenantId) {
    return this.find().setOptions({ _tenantId: tenantId });
  };

  /**
   * Find one document by tenant
   * @param {ObjectId|string} tenantId - The tenant ID
   * @param {Object} conditions - Query conditions
   * @returns {Query} Mongoose query
   */
  schema.statics.findOneByTenant = function(tenantId, conditions = {}) {
    return this.findOne(conditions).setOptions({ _tenantId: tenantId });
  };

  /**
   * Find by ID within a tenant scope
   * @param {ObjectId|string} tenantId - The tenant ID
   * @param {ObjectId|string} id - The document ID
   * @returns {Query} Mongoose query
   */
  schema.statics.findByIdInTenant = function(tenantId, id) {
    return this.findOne({ _id: id }).setOptions({ _tenantId: tenantId });
  };

  /**
   * Count documents for a specific tenant
   * @param {ObjectId|string} tenantId - The tenant ID
   * @param {Object} conditions - Query conditions
   * @returns {Query} Mongoose query
   */
  schema.statics.countByTenant = function(tenantId, conditions = {}) {
    return this.countDocuments(conditions).setOptions({ _tenantId: tenantId });
  };

  /**
   * Update documents within tenant scope
   * @param {ObjectId|string} tenantId - The tenant ID
   * @param {Object} conditions - Query conditions
   * @param {Object} update - Update operations
   * @param {Object} options - Update options
   * @returns {Query} Mongoose query
   */
  schema.statics.updateByTenant = function(tenantId, conditions, update, options = {}) {
    return this.updateMany(conditions, update, { ...options, _tenantId: tenantId });
  };

  /**
   * Delete documents within tenant scope
   * @param {ObjectId|string} tenantId - The tenant ID
   * @param {Object} conditions - Query conditions
   * @returns {Query} Mongoose query
   */
  schema.statics.deleteByTenant = function(tenantId, conditions = {}) {
    return this.deleteMany(conditions).setOptions({ _tenantId: tenantId });
  };

  /**
   * Execute a query without tenant filtering (for super admin operations)
   * SECURITY WARNING: Only use this for admin operations with proper authorization!
   *
   * @returns {Query} Mongoose query with tenant filter bypassed
   */
  schema.statics.withoutTenantFilter = function() {
    return this.find().setOptions({ _bypassTenantFilter: true });
  };

  /**
   * Create a tenant-scoped query builder
   * Usage: Model.withTenant(tenantId).find({ ... })
   *
   * @param {ObjectId|string} tenantId - The tenant ID to scope to
   * @returns {Object} Query builder with tenant context
   */
  schema.statics.withTenant = function(tenantId) {
    const model = this;

    return {
      find: (conditions = {}, projection = null, options = {}) => {
        return model.find(conditions, projection, { ...options, _tenantId: tenantId });
      },
      findOne: (conditions = {}, projection = null, options = {}) => {
        return model.findOne(conditions, projection, { ...options, _tenantId: tenantId });
      },
      findById: (id, projection = null, options = {}) => {
        return model.findById(id, projection, { ...options, _tenantId: tenantId });
      },
      countDocuments: (conditions = {}, options = {}) => {
        return model.countDocuments(conditions, { ...options, _tenantId: tenantId });
      },
      updateOne: (conditions, update, options = {}) => {
        return model.updateOne(conditions, update, { ...options, _tenantId: tenantId });
      },
      updateMany: (conditions, update, options = {}) => {
        return model.updateMany(conditions, update, { ...options, _tenantId: tenantId });
      },
      deleteOne: (conditions, options = {}) => {
        return model.deleteOne(conditions, { ...options, _tenantId: tenantId });
      },
      deleteMany: (conditions = {}, options = {}) => {
        return model.deleteMany(conditions, { ...options, _tenantId: tenantId });
      },
      create: async (docs) => {
        // Ensure tenant_id is set on all documents
        if (Array.isArray(docs)) {
          docs.forEach(doc => { doc.tenant_id = tenantId; });
        } else {
          docs.tenant_id = tenantId;
        }
        return model.create(docs);
      },
      aggregate: (pipeline = []) => {
        // Prepend tenant filter to aggregation pipeline
        return model.aggregate([
          { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
          ...pipeline
        ]);
      }
    };
  };

  /**
   * Validate that a related document belongs to the same tenant
   *
   * @param {Object} doc - The document to validate
   * @param {string} relatedField - The field containing the related document ID
   * @param {string} relatedModel - The name of the related model
   * @returns {Promise<boolean>} True if related document belongs to same tenant
   */
  schema.methods.validateRelatedTenant = async function(relatedField, relatedModel) {
    if (!this[relatedField]) {
      return true; // No related document, validation passes
    }

    const RelatedModel = mongoose.model(relatedModel);
    const relatedDoc = await RelatedModel.findById(this[relatedField]);

    if (!relatedDoc) {
      throw new Error(`Related ${relatedModel} not found`);
    }

    if (!relatedDoc.tenant_id) {
      throw new Error(`Related ${relatedModel} is not tenant-scoped`);
    }

    if (relatedDoc.tenant_id.toString() !== this.tenant_id.toString()) {
      throw new Error(`Cross-tenant reference detected: ${relatedModel} belongs to different tenant`);
    }

    return true;
  };
}

module.exports = tenantPlugin;
