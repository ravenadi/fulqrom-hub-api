/**
 * Mongoose Tenant Plugin (ALS-Powered)
 *
 * This plugin adds automatic tenant isolation to Mongoose models using
 * AsyncLocalStorage for context propagation.
 *
 * Features:
 * - Auto-adds tenant_id to ALL queries using ALS context
 * - No need to pass _tenantId options manually
 * - Strict enforcement: fails in production if tenantId missing
 * - Supports bypassing for super admin (with strict guards)
 * - Prevents cross-tenant data access
 */

const mongoose = require('mongoose');
const { getTenant } = require('../utils/requestContext');

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
   * Pre-find middleware to automatically add tenant_id filter using ALS
   * Applies to: find, findOne, findOneAndUpdate, findOneAndDelete, etc.
   */
  const preFindMiddleware = function(next) {
    const query = this.getQuery();
    const modelName = this.model?.modelName;

    // DEBUG: Log every query attempt
    console.log(`🔍 [TENANT-PLUGIN] ${modelName} query | getTenant()=${getTenant()} | options._tenantId=${this.getOptions()._tenantId}`);

    // Skip if tenant_id is already explicitly in the query
    if (query.tenant_id) {
      console.log(`✅ [TENANT-PLUGIN] ${modelName} | tenant_id already in query: ${query.tenant_id}`);
      return next();
    }

    // Get tenant from ALS context (or fallback to options for backward compatibility)
    const tenantId = getTenant() || this.getOptions()._tenantId;

    if (!tenantId) {
      console.error(`❌ [TENANT-PLUGIN] ${modelName} | NO TENANT CONTEXT | ENV=${process.env.NODE_ENV}`);
      // SECURITY: Enforce tenant filtering in ALL environments
      const error = new Error(`Tenant context required for ${modelName} queries. This is a security requirement.`);
      error.code = 'TENANT_CONTEXT_MISSING';
      console.error('❌ SECURITY: Query without tenant context blocked', {
        operation: 'find',
        model: modelName,
        query: query
      });
      return next(error);
    }

    // Add tenant_id to the query
    console.log(`✅ [TENANT-PLUGIN] ${modelName} | Adding tenant filter: ${tenantId}`);
    this.where({ tenant_id: tenantId });
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
   * Pre-update middleware to prevent cross-tenant updates using ALS
   */
  const preUpdateMiddleware = function(next) {
    const query = this.getQuery();
    const modelName = this.model?.modelName;

    console.log(`🔍 [TENANT-PLUGIN] ${modelName} UPDATE | getTenant()=${getTenant()} | options._tenantId=${this.getOptions()._tenantId}`);

    // Skip if tenant_id already in query
    if (query.tenant_id) {
      console.log(`✅ [TENANT-PLUGIN] ${modelName} UPDATE | tenant_id already in query: ${query.tenant_id}`);
      return next();
    }

    // Get tenant from ALS
    const tenantId = getTenant() || this.getOptions()._tenantId;

    if (!tenantId) {
      console.error(`❌ [TENANT-PLUGIN] ${modelName} UPDATE | NO TENANT CONTEXT`);
      // SECURITY: Enforce tenant filtering in all environments
      const error = new Error(`Tenant context required for ${modelName} updates. This is a security requirement.`);
      error.code = 'TENANT_CONTEXT_MISSING';
      return next(error);
    }

    // Add tenant_id to the update filter
    console.log(`✅ [TENANT-PLUGIN] ${modelName} UPDATE | Adding tenant filter: ${tenantId}`);
    this.where({ tenant_id: tenantId });
    next();
  };

  // Apply to update operations
  schema.pre('updateOne', preUpdateMiddleware);
  schema.pre('updateMany', preUpdateMiddleware);
  schema.pre('update', preUpdateMiddleware);

  /**
   * Pre-delete middleware to prevent cross-tenant deletes using ALS
   */
  const preDeleteMiddleware = function(next) {
    const query = this.getQuery();
    const modelName = this.model?.modelName;

    console.log(`🔍 [TENANT-PLUGIN] ${modelName} DELETE | getTenant()=${getTenant()} | options._tenantId=${this.getOptions()._tenantId}`);

    // Skip if tenant_id already in query
    if (query.tenant_id) {
      console.log(`✅ [TENANT-PLUGIN] ${modelName} DELETE | tenant_id already in query: ${query.tenant_id}`);
      return next();
    }

    // Get tenant from ALS
    const tenantId = getTenant() || this.getOptions()._tenantId;

    if (!tenantId) {
      console.error(`❌ [TENANT-PLUGIN] ${modelName} DELETE | NO TENANT CONTEXT`);
      // SECURITY: Enforce tenant filtering in all environments
      const error = new Error(`Tenant context required for ${modelName} deletes. This is a security requirement.`);
      error.code = 'TENANT_CONTEXT_MISSING';
      return next(error);
    }

    // Add tenant_id to the delete filter
    console.log(`✅ [TENANT-PLUGIN] ${modelName} DELETE | Adding tenant filter: ${tenantId}`);
    this.where({ tenant_id: tenantId });
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

  /**
   * Pre-save middleware to auto-set tenant_id on new documents
   */
  schema.pre('save', function(next) {
    // Only set tenant_id if document is new and doesn't have one
    if (this.isNew && !this.tenant_id) {
      const tenantId = getTenant();
      
      if (!tenantId) {
        if (process.env.NODE_ENV === 'production' && required) {
          const error = new Error('Tenant context missing for save. Cannot create document without tenant.');
          error.code = 'TENANT_CONTEXT_MISSING';
          console.error('❌ SECURITY: Save without tenant context blocked', {
            operation: 'save',
            model: this.constructor.modelName
          });
          return next(error);
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️  Saving new document without tenant_id: ${this.constructor.modelName}`);
        }
      } else {
        this.tenant_id = tenantId;
      }
    }
    
    next();
  });

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
   * Execute a query without tenant filtering (REMOVED FOR SECURITY)
   *
   * This method has been removed. Super admins must use the x-tenant-id header
   * to access tenant data. No bypass mechanism is allowed.
   *
   * @deprecated Use x-tenant-id header instead
   * @throws {Error} Always throws - bypass not allowed
   */
  schema.statics.withoutTenantFilter = function() {
    throw new Error('Tenant filter bypass has been removed for security. Super admins must provide x-tenant-id header to access tenant data.');
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
