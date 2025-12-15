/**
 * Entity Lookup Service
 * Centralized service for fetching and populating entity names across documents.
 * Eliminates duplicated fetchEntityNames/batchFetchEntityNames logic across route files.
 *
 * @module services/entityLookupService
 */

const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');

class EntityLookupService {
  /**
   * Fetch entity names for a single document
   * @param {Object} documentData - The document data containing entity IDs
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {Object} - Object containing entity names
   */
  async fetchEntityNames(documentData, tenantId) {
    const entityNames = {
      customer_name: 'Unknown Customer',
      site_name: null,
      building_name: null,
      floor_name: null,
      asset_name: null,
      tenant_name: null,
      vendor_name: null
    };

    try {
      // Extract IDs from different possible locations
      const customerId = documentData.customer?.customer_id || documentData.customer_id;
      const siteId = documentData.location?.site?.site_id || documentData.site_id;
      const buildingId = documentData.location?.building?.building_id || documentData.building_id;
      const floorId = documentData.location?.floor?.floor_id || documentData.floor_id;
      const assetId = documentData.location?.asset?.asset_id || documentData.asset_id;
      const buildingTenantId = documentData.location?.tenant?.tenant_id || documentData.building_tenant_id;
      const vendorId = documentData.location?.vendor?.vendor_id || documentData.vendor_id;

      // Fetch all entities in parallel
      const [customer, site, building, floor, asset, buildingTenant, vendor] = await Promise.all([
        customerId ? Customer.findById(customerId.toString()).setOptions({ _tenantId: tenantId }).lean() : null,
        siteId ? Site.findById(siteId.toString()).setOptions({ _tenantId: tenantId }).lean() : null,
        buildingId ? Building.findById(buildingId.toString()).setOptions({ _tenantId: tenantId }).lean() : null,
        floorId ? Floor.findById(floorId.toString()).setOptions({ _tenantId: tenantId }).lean() : null,
        assetId ? Asset.findOne({ asset_id: assetId }).setOptions({ _tenantId: tenantId }).lean() : null,
        buildingTenantId ? BuildingTenant.findById(buildingTenantId.toString()).setOptions({ _tenantId: tenantId }).lean() : null,
        vendorId ? Vendor.findById(vendorId.toString()).setOptions({ _tenantId: tenantId }).lean() : null
      ]);

      // Populate entity names
      if (customer) {
        entityNames.customer_name = customer.organisation?.organisation_name ||
          customer.company_profile?.trading_name ||
          customer.company_profile?.organisation_name ||
          'Unknown Customer';
      }

      if (site) {
        entityNames.site_name = site.site_name;
      }

      if (building) {
        entityNames.building_name = building.building_name;
      }

      if (floor) {
        entityNames.floor_name = floor.floor_name;
      }

      if (asset) {
        entityNames.asset_name = asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset';
        entityNames.asset_type = asset.type || asset.category;
      } else if (assetId) {
        entityNames.asset_name = `Asset ${assetId}`;
      }

      // Fetch multiple assets if present
      const assetIds = documentData.location?.assets?.map(a => a.asset_id) ||
        (documentData.asset_ids && Array.isArray(documentData.asset_ids) ? documentData.asset_ids : []);
      if (assetIds.length > 0) {
        const assets = await Asset.find({ asset_id: { $in: assetIds } }).setOptions({ _tenantId: tenantId }).lean();
        entityNames.assets = assets.map(a => ({
          asset_id: a.asset_id,
          asset_name: a.asset_no || a.device_id || a.asset_id || 'Unknown Asset',
          asset_type: a.type || a.category || ''
        }));
      }

      if (buildingTenant) {
        entityNames.tenant_name = buildingTenant.tenant_name;
      }

      if (vendor) {
        entityNames.vendor_name = vendor.contractor_name;
      }
    } catch (error) {
      console.error('Error fetching entity names:', error.message);
    }

    return entityNames;
  }

  /**
   * Batch fetch entity names for multiple documents to avoid N+1 query problem
   * @param {Object[]} documents - Array of document objects
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {Object[]} - Array of documents with populated entity names
   */
  async batchFetchEntityNames(documents, tenantId) {
    if (!documents || documents.length === 0) {
      return [];
    }

    // Step 1: Collect all unique IDs from all documents
    const customerIds = new Set();
    const siteIds = new Set();
    const buildingIds = new Set();
    const floorIds = new Set();
    const assetIds = new Set();
    const tenantIds = new Set();
    const vendorIds = new Set();

    documents.forEach(doc => {
      const customerId = doc.customer?.customer_id;
      const siteId = doc.location?.site?.site_id;
      const buildingId = doc.location?.building?.building_id;
      const floorId = doc.location?.floor?.floor_id;
      const assetId = doc.location?.asset?.asset_id;
      const buildingTenantId = doc.location?.tenant?.tenant_id;
      const vendorId = doc.location?.vendor?.vendor_id;

      if (customerId) customerIds.add(customerId.toString());
      if (siteId) siteIds.add(siteId.toString());
      if (buildingId) buildingIds.add(buildingId.toString());
      if (floorId) floorIds.add(floorId.toString());
      if (assetId) assetIds.add(assetId.toString());
      if (buildingTenantId) tenantIds.add(buildingTenantId.toString());
      if (vendorId) vendorIds.add(vendorId.toString());

      // Collect multiple assets if present
      const docAssetIds = doc.location?.assets?.map(a => a.asset_id) || [];
      docAssetIds.forEach(id => {
        if (id) assetIds.add(id.toString());
      });
    });

    // Step 2: Fetch ALL entities in parallel with batch queries
    const [customers, sites, buildings, floors, assets, tenants, vendors] = await Promise.all([
      customerIds.size > 0
        ? Customer.find({ _id: { $in: Array.from(customerIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      siteIds.size > 0
        ? Site.find({ _id: { $in: Array.from(siteIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      buildingIds.size > 0
        ? Building.find({ _id: { $in: Array.from(buildingIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      floorIds.size > 0
        ? Floor.find({ _id: { $in: Array.from(floorIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      assetIds.size > 0
        ? Asset.find({ asset_id: { $in: Array.from(assetIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      tenantIds.size > 0
        ? BuildingTenant.find({ _id: { $in: Array.from(tenantIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : [],
      vendorIds.size > 0
        ? Vendor.find({ _id: { $in: Array.from(vendorIds) } }).setOptions({ _tenantId: tenantId }).lean()
        : []
    ]);

    // Step 3: Create lookup maps for O(1) access
    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const siteMap = new Map(sites.map(s => [s._id.toString(), s]));
    const buildingMap = new Map(buildings.map(b => [b._id.toString(), b]));
    const floorMap = new Map(floors.map(f => [f._id.toString(), f]));
    const assetMap = new Map(assets.map(a => [a.asset_id, a]));
    const tenantMap = new Map(tenants.map(t => [t._id.toString(), t]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

    // Step 4: Populate documents using the maps (no additional DB queries)
    return documents.map(doc => {
      const customer = customerMap.get(doc.customer?.customer_id?.toString());
      const site = siteMap.get(doc.location?.site?.site_id?.toString());
      const building = buildingMap.get(doc.location?.building?.building_id?.toString());
      const floor = floorMap.get(doc.location?.floor?.floor_id?.toString());
      const asset = assetMap.get(doc.location?.asset?.asset_id);
      const tenant = tenantMap.get(doc.location?.tenant?.tenant_id?.toString());
      const vendor = vendorMap.get(doc.location?.vendor?.vendor_id?.toString());

      // Handle multiple assets
      const docAssetIds = doc.location?.assets?.map(a => a.asset_id) || [];
      const populatedAssets = docAssetIds
        .map(assetId => {
          const assetData = assetMap.get(assetId);
          if (assetData) {
            return {
              asset_id: assetData.asset_id,
              asset_name: assetData.asset_no || assetData.device_id || assetData.asset_id || 'Unknown Asset',
              asset_type: assetData.type || assetData.category || ''
            };
          }
          return null;
        })
        .filter(a => a !== null);

      return {
        ...doc,
        customer: {
          customer_id: doc.customer?.customer_id,
          customer_name: customer
            ? (customer.organisation?.organisation_name ||
              customer.company_profile?.trading_name ||
              customer.company_profile?.organisation_name ||
              'Unknown Customer')
            : 'Unknown Customer'
        },
        location: {
          site: doc.location?.site?.site_id ? {
            site_id: doc.location.site.site_id,
            site_name: site?.site_name || null
          } : undefined,
          building: doc.location?.building?.building_id ? {
            building_id: doc.location.building.building_id,
            building_name: building?.building_name || null
          } : undefined,
          floor: doc.location?.floor?.floor_id ? {
            floor_id: doc.location.floor.floor_id,
            floor_name: floor?.floor_name || null
          } : undefined,
          // Multiple assets support
          assets: populatedAssets.length > 0 ? populatedAssets : undefined,
          // Legacy single asset (for backward compatibility)
          asset: doc.location?.asset?.asset_id ? {
            asset_id: doc.location.asset.asset_id,
            asset_name: asset?.asset_no || asset?.device_id || asset?.asset_id || 'Unknown Asset',
            asset_type: asset?.type || asset?.category
          } : undefined,
          tenant: doc.location?.tenant?.tenant_id ? {
            tenant_id: doc.location.tenant.tenant_id,
            tenant_name: tenant?.tenant_name || null
          } : undefined,
          vendor: doc.location?.vendor?.vendor_id ? {
            vendor_id: doc.location.vendor.vendor_id,
            vendor_name: vendor?.contractor_name || null
          } : undefined
        }
      };
    });
  }

  /**
   * Get customer name by ID
   * @param {string} customerId - The customer ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string} - Customer name or default
   */
  async getCustomerName(customerId, tenantId) {
    if (!customerId) return 'Unknown Customer';

    try {
      const customer = await Customer.findById(customerId).setOptions({ _tenantId: tenantId }).lean();
      if (customer) {
        return customer.organisation?.organisation_name ||
          customer.company_profile?.trading_name ||
          customer.company_profile?.organisation_name ||
          'Unknown Customer';
      }
    } catch (error) {
      console.error('Error fetching customer name:', error.message);
    }

    return 'Unknown Customer';
  }

  /**
   * Get site name by ID
   * @param {string} siteId - The site ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string|null} - Site name or null
   */
  async getSiteName(siteId, tenantId) {
    if (!siteId) return null;

    try {
      const site = await Site.findById(siteId).setOptions({ _tenantId: tenantId }).lean();
      return site?.site_name || null;
    } catch (error) {
      console.error('Error fetching site name:', error.message);
      return null;
    }
  }

  /**
   * Get building name by ID
   * @param {string} buildingId - The building ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string|null} - Building name or null
   */
  async getBuildingName(buildingId, tenantId) {
    if (!buildingId) return null;

    try {
      const building = await Building.findById(buildingId).setOptions({ _tenantId: tenantId }).lean();
      return building?.building_name || null;
    } catch (error) {
      console.error('Error fetching building name:', error.message);
      return null;
    }
  }

  /**
   * Get floor name by ID
   * @param {string} floorId - The floor ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string|null} - Floor name or null
   */
  async getFloorName(floorId, tenantId) {
    if (!floorId) return null;

    try {
      const floor = await Floor.findById(floorId).setOptions({ _tenantId: tenantId }).lean();
      return floor?.floor_name || null;
    } catch (error) {
      console.error('Error fetching floor name:', error.message);
      return null;
    }
  }

  /**
   * Get asset info by asset_id
   * @param {string} assetId - The asset_id (not _id)
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {Object|null} - Asset info or null
   */
  async getAssetInfo(assetId, tenantId) {
    if (!assetId) return null;

    try {
      const asset = await Asset.findOne({ asset_id: assetId }).setOptions({ _tenantId: tenantId }).lean();
      if (asset) {
        return {
          asset_id: asset.asset_id,
          asset_name: asset.asset_no || asset.device_id || asset.asset_id || 'Unknown Asset',
          asset_type: asset.type || asset.category
        };
      }
    } catch (error) {
      console.error('Error fetching asset info:', error.message);
    }

    return null;
  }

  /**
   * Get vendor name by ID
   * @param {string} vendorId - The vendor ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string|null} - Vendor name or null
   */
  async getVendorName(vendorId, tenantId) {
    if (!vendorId) return null;

    try {
      const vendor = await Vendor.findById(vendorId).setOptions({ _tenantId: tenantId }).lean();
      return vendor?.contractor_name || null;
    } catch (error) {
      console.error('Error fetching vendor name:', error.message);
      return null;
    }
  }

  /**
   * Get building tenant name by ID
   * @param {string} buildingTenantId - The building tenant ID
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {string|null} - Building tenant name or null
   */
  async getBuildingTenantName(buildingTenantId, tenantId) {
    if (!buildingTenantId) return null;

    try {
      const buildingTenant = await BuildingTenant.findById(buildingTenantId).setOptions({ _tenantId: tenantId }).lean();
      return buildingTenant?.tenant_name || null;
    } catch (error) {
      console.error('Error fetching building tenant name:', error.message);
      return null;
    }
  }

  /**
   * Batch lookup multiple entities by their IDs
   * @param {string[]} ids - Array of entity IDs
   * @param {string} entityType - Type of entity ('customer', 'site', 'building', 'floor', 'asset', 'vendor', 'buildingTenant')
   * @param {string} tenantId - The tenant ID for filtering
   * @returns {Map} - Map of ID to entity object
   */
  async batchLookup(ids, entityType, tenantId) {
    if (!ids || ids.length === 0) return new Map();

    const uniqueIds = [...new Set(ids.map(id => id?.toString()).filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    let Model;
    let idField = '_id';

    switch (entityType) {
      case 'customer':
        Model = Customer;
        break;
      case 'site':
        Model = Site;
        break;
      case 'building':
        Model = Building;
        break;
      case 'floor':
        Model = Floor;
        break;
      case 'asset':
        Model = Asset;
        idField = 'asset_id';
        break;
      case 'vendor':
        Model = Vendor;
        break;
      case 'buildingTenant':
        Model = BuildingTenant;
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    try {
      const entities = await Model.find({ [idField]: { $in: uniqueIds } })
        .setOptions({ _tenantId: tenantId })
        .lean();

      return new Map(entities.map(e => [
        idField === '_id' ? e._id.toString() : e[idField],
        e
      ]));
    } catch (error) {
      console.error(`Error batch looking up ${entityType}:`, error.message);
      return new Map();
    }
  }
}

module.exports = new EntityLookupService();
