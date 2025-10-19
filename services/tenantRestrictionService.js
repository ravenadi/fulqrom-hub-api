const Customer = require('../models/Customer');
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
 * Matches Laravel DR TenantRestrictionService functionality
 */
class TenantRestrictionService {
  /**
   * Get tenant's active plan (simplified)
   */
  async getTenantPlan(tenantId) {
    const tenant = await Customer.findById(tenantId).populate('plan_id');

    // Check if tenant is active and not expired
    if (tenant && tenant.plan_id && tenant.is_active) {
      // Check if plan has expired (if plan_end_date is set)
      if (tenant.plan_end_date && tenant.plan_end_date < new Date()) {
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
    if (!plan || plan.features.max_users === null) {
      return true;
    }

    const currentUsers = await this.getUsersCount(tenantId);

    if (currentUsers >= plan.features.max_users) {
      throw new Error(
        `Plan Limit hit. Please upgrade your plan to add more users. Current: ${currentUsers}/${plan.features.max_users}`
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
    if (!plan || plan.features.max_documents === null) {
      return true;
    }

    const currentDocuments = await this.getDocumentsCount(tenantId);

    if (currentDocuments >= plan.features.max_documents) {
      throw new Error(
        `Plan Restriction Error - You have reached the maximum number of documents (${currentDocuments}/${plan.features.max_documents}). Please upgrade your plan to upload more documents.`
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
    if (!plan || plan.features.max_storage_gb === null) {
      return true;
    }

    const currentStorageGB = await this.getStorageUsage(tenantId);
    const projectedStorageGB = currentStorageGB + fileSizeGB;

    if (projectedStorageGB > plan.features.max_storage_gb) {
      throw new Error(
        `Plan Restriction Error - This upload would exceed your storage limit (${projectedStorageGB}GB/${plan.features.max_storage_gb}GB). Please upgrade your plan or delete some files to free up space.`
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

    if (!plan || plan.features.max_sites === null) {
      return true;
    }

    const currentSites = await this.getSitesCount(tenantId);

    if (currentSites >= plan.features.max_sites) {
      throw new Error(
        `Plan Limit hit. Please upgrade your plan to add more sites. Current: ${currentSites}/${plan.features.max_sites}`
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

    if (!plan || plan.features.max_buildings === null) {
      return true;
    }

    const currentBuildings = await this.getBuildingsCount(tenantId);

    if (currentBuildings >= plan.features.max_buildings) {
      throw new Error(
        `Plan Limit hit. Please upgrade your plan to add more buildings. Current: ${currentBuildings}/${plan.features.max_buildings}`
      );
    }

    return true;
  }

  // Private helper methods

  async getUsersCount(tenantId) {
    return await User.countDocuments({ customer_id: tenantId });
  }

  async getDocumentsCount(tenantId) {
    return await Document.countDocuments({ customer_id: tenantId });
  }

  async getSitesCount(tenantId) {
    return await Site.countDocuments({ customer_id: tenantId });
  }

  async getBuildingsCount(tenantId) {
    return await Building.countDocuments({ customer_id: tenantId });
  }

  async getFloorsCount(tenantId) {
    return await Floor.countDocuments({ customer_id: tenantId });
  }

  async getAssetsCount(tenantId) {
    return await Asset.countDocuments({ customer_id: tenantId });
  }

  async getVendorsCount(tenantId) {
    return await Vendor.countDocuments({ customer_id: tenantId });
  }

  async getStorageUsage(tenantId) {
    // Calculate storage usage from documents (assuming file_size field exists)
    const result = await Document.aggregate([
      { $match: { customer_id: tenantId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$file_size', 0] } } } }
    ]);

    const totalBytes = result.length > 0 ? result[0].total : 0;

    // Convert bytes to GB
    return Math.round((totalBytes / (1024 * 1024 * 1024)) * 100) / 100;
  }
}

module.exports = new TenantRestrictionService();
