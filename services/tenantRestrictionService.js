const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');

/**
 * Tenant Restriction Service
 * Enforces plan limits for tenant resources (users, documents, storage, etc.)
 */
class TenantRestrictionService {
  /**
   * Get tenant's active plan
   * @param {string} tenantId - The tenant ID (from req.tenant.tenantId)
   */
  async getTenantPlan(tenantId) {
    // Use skipTenantFilter since we're looking up the Tenant itself, not a tenant-scoped resource
    const tenant = await Tenant.findById(tenantId).populate('plan_id');

    // Check if tenant exists and has a plan
    if (tenant && tenant.plan_id) {
      // Check if tenant is active (not suspended/inactive)
      if (tenant.status === 'suspended' || tenant.status === 'inactive') {
        return null; // Tenant is not active
      }

      // Check if plan has expired (if plan_end_date is set)
      if (tenant.plan_status?.plan_end_date && tenant.plan_status.plan_end_date < new Date()) {
        return null; // Plan expired
      }

      return tenant.plan_id;
    }

    return null;
  }

  /**
   * Calculate actual usage for a tenant (essential fields only)
   */
  async calculateTenantUsage(tenantId) {
    return {
      users: await this.getUsersCount(tenantId),
      documents: await this.getDocumentsCount(tenantId),
      storage_gb: await this.getStorageUsage(tenantId),
      sites: await this.getSitesCount(tenantId),
      buildings: await this.getBuildingsCount(tenantId),
      floors: await this.getFloorsCount(tenantId),
      assets: await this.getAssetsCount(tenantId),
      vendors: await this.getVendorsCount(tenantId)
    };
  }

  /**
   * Check if tenant can create a new user
   * @throws Error
   */
  async checkCanCreateUser(tenantId) {
    const plan = await this.getTenantPlan(tenantId);

    // If no plan or unlimited users (null means unlimited), allow creation
    // Plan has max_users at top level, not in features
    if (!plan || plan.max_users === null || plan.max_users === undefined) {
      return true;
    }

    const currentUsers = await this.getUsersCount(tenantId);

    if (currentUsers >= plan.max_users) {
      throw new Error(
        `Plan limit reached. Your plan allows ${plan.max_users} users. Current: ${currentUsers}/${plan.max_users}. Please upgrade your plan to add more users.`
      );
    }

    return true;
  }

  /**
   * Check if tenant can create a new document
   * @throws Error
   */
  async checkCanCreateDocument(tenantId) {
    const plan = await this.getTenantPlan(tenantId);

    // If no plan or unlimited documents (null means unlimited), allow creation
    // Plan has max_documents at top level, not in features
    if (!plan || plan.max_documents === null || plan.max_documents === undefined) {
      return true;
    }

    const currentDocuments = await this.getDocumentsCount(tenantId);

    if (currentDocuments >= plan.max_documents) {
      throw new Error(
        `Plan limit reached. Your plan allows ${plan.max_documents} documents. Current: ${currentDocuments}/${plan.max_documents}. Please upgrade your plan to upload more documents.`
      );
    }

    return true;
  }

  /**
   * Check if tenant can upload file based on storage limit
   * @throws Error
   */
  async checkCanUploadFile(tenantId, fileSizeGB = 0) {
    const plan = await this.getTenantPlan(tenantId);

    // If no plan or unlimited storage (null means unlimited), allow upload
    // Plan has max_storage_gb at top level, not in features
    if (!plan || plan.max_storage_gb === null || plan.max_storage_gb === undefined) {
      return true;
    }

    const currentStorageGB = await this.getStorageUsage(tenantId);
    const projectedStorageGB = currentStorageGB + fileSizeGB;

    if (projectedStorageGB > plan.max_storage_gb) {
      throw new Error(
        `Plan limit reached. This upload would exceed your storage limit (${projectedStorageGB.toFixed(2)}GB/${plan.max_storage_gb}GB). Please upgrade your plan or delete some files.`
      );
    }

    return true;
  }

  /**
   * Check if tenant can create a new site
   * @throws Error
   */
  async checkCanCreateSite(tenantId) {
    const plan = await this.getTenantPlan(tenantId);

    // Note: max_sites might be in features object for custom plans
    const maxSites = plan?.features?.max_sites ?? null;
    if (!plan || maxSites === null || maxSites === undefined) {
      return true;
    }

    const currentSites = await this.getSitesCount(tenantId);

    if (currentSites >= maxSites) {
      throw new Error(
        `Plan limit reached. Your plan allows ${maxSites} sites. Current: ${currentSites}/${maxSites}. Please upgrade your plan to add more sites.`
      );
    }

    return true;
  }

  /**
   * Check if tenant can create a new building
   * @throws Error
   */
  async checkCanCreateBuilding(tenantId) {
    const plan = await this.getTenantPlan(tenantId);

    // Note: max_buildings might be in features object for custom plans
    const maxBuildings = plan?.features?.max_buildings ?? null;
    if (!plan || maxBuildings === null || maxBuildings === undefined) {
      return true;
    }

    const currentBuildings = await this.getBuildingsCount(tenantId);

    if (currentBuildings >= maxBuildings) {
      throw new Error(
        `Plan limit reached. Your plan allows ${maxBuildings} buildings. Current: ${currentBuildings}/${maxBuildings}. Please upgrade your plan to add more buildings.`
      );
    }

    return true;
  }

  // Private helper methods

  async getUsersCount(tenantId) {
    // Count users by tenant_id (multi-tenant isolation field)
    return await User.countDocuments({ tenant_id: tenantId });
  }

  async getDocumentsCount(tenantId) {
    return await Document.countDocuments({ tenant_id: tenantId });
  }

  async getSitesCount(tenantId) {
    return await Site.countDocuments({ tenant_id: tenantId });
  }

  async getBuildingsCount(tenantId) {
    return await Building.countDocuments({ tenant_id: tenantId });
  }

  async getFloorsCount(tenantId) {
    return await Floor.countDocuments({ tenant_id: tenantId });
  }

  async getAssetsCount(tenantId) {
    return await Asset.countDocuments({ tenant_id: tenantId });
  }

  async getVendorsCount(tenantId) {
    return await Vendor.countDocuments({ tenant_id: tenantId });
  }

  async getStorageUsage(tenantId) {
    // Calculate storage usage from documents by tenant_id
    const mongoose = require('mongoose');
    const result = await Document.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$file_size', 0] } } } }
    ]);

    const totalBytes = result.length > 0 ? result[0].total : 0;

    // Convert bytes to GB
    return Math.round((totalBytes / (1024 * 1024 * 1024)) * 100) / 100;
  }
}

module.exports = new TenantRestrictionService();
