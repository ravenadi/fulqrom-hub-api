const express = require('express');
const DROPDOWN_CONSTANTS = require('../constants/dropdownConstants');
const Settings = require('../models/Settings');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Vendor = require('../models/Vendor');
const Document = require('../models/Document');

const router = express.Router();

// Helper function to clean array values (remove empty strings, null, undefined)
function cleanArrayValues(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(item => item !== null && item !== undefined && item !== '' && (typeof item !== 'string' || item.trim() !== ''));
}

// Helper function to flatten nested structure to match frontend format
// Converts { customer: { industry_types: [...] } } to { customer_industry_types: [...] }
function flattenDropdowns(nested) {
  const flattened = {};

  Object.keys(nested).forEach(module => {
    Object.keys(nested[module]).forEach(field => {
      const flatKey = `${module}_${field}`;
      // Clean the array values to remove empty strings and sort alphabetically
      const cleanedArray = cleanArrayValues(nested[module][field]);
      flattened[flatKey] = Array.isArray(cleanedArray)
        ? cleanedArray.sort((a, b) => {
            if (typeof a === 'string' && typeof b === 'string') {
              return a.localeCompare(b, 'en-AU', { sensitivity: 'base' });
            }
            return 0;
          })
        : cleanedArray;
    });
  });

  return flattened;
}

// Helper function to unflatten frontend format back to nested structure
// Converts { customer_industry_types: [...] } to { customer: { industry_types: [...] } }
function unflattenDropdowns(flattened) {
  const nested = {};

  Object.keys(flattened).forEach(flatKey => {
    const parts = flatKey.split('_');
    const module = parts[0];
    const field = parts.slice(1).join('_');

    if (!nested[module]) {
      nested[module] = {};
    }
    nested[module][field] = flattened[flatKey];
  });

  return nested;
}

/**
 * Filter entities based on user's resource_access array
 * Admin users bypass all filtering
 *
 * @param {Array} entities - Array of entity objects with _id field
 * @param {string} resourceType - Type of resource ('customer', 'site', 'building', 'floor', 'asset', 'tenant', 'vendor')
 * @param {Object} user - User object from req.user
 * @returns {Array} Filtered entities array
 */
function filterByResourceAccess(entities, resourceType, user) {
  // No user provided - return empty
  if (!user) {
    return [];
  }

  // Admin bypass - see everything
  // Check role_ids array for Admin role
  if (user.role_ids && Array.isArray(user.role_ids)) {
    const hasAdminRole = user.role_ids.some(role =>
      role && (role.name === 'Admin' || role.name === 'admin' || role.name === 'ADMIN')
    );
    if (hasAdminRole) {
      console.log(`✅ [FILTER] Admin bypass for ${user.email} - showing all ${resourceType}s`);
      return entities;
    }
  }

  // If user has no resource_access array, show all (permissive default)
  // Role-based module permissions are already checked at authorization layer
  if (!user.resource_access || !Array.isArray(user.resource_access)) {
    return entities;
  }

  // If resource_access array is empty, show all
  if (user.resource_access.length === 0) {
    return entities;
  }

  // Get allowed resource IDs for this resource type
  const allowedResourceIds = user.resource_access
    .filter(ra => ra.resource_type === resourceType)
    .map(ra => ra.resource_id?.toString())
    .filter(id => id); // Remove nulls/undefined

  // If no specific access defined for this resource type, show all (permissive default)
  // This means the user's role has access to the module, but no specific resource restrictions
  if (allowedResourceIds.length === 0) {
    return entities;
  }

  // Filter entities to only those in allowed list
  return entities.filter(entity =>
    allowedResourceIds.includes(entity._id.toString())
  );
}

// ===== Entity Dropdown Endpoints (must be before parameterized routes) =====

// GET /api/dropdowns/entities/customers - Get all customers for dropdown
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/customers', async (req, res) => {
  try {
    // Get tenant ID from request context, allow fallback to header or query
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const query = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    console.log('🔍 [CUSTOMER DROPDOWN] Query:', JSON.stringify(query));

    let customers = await Customer.find(query)
      .select('_id organisation.organisation_name')
      .sort({ 'organisation.organisation_name': 1 })
      .lean();

    console.log('🔍 [CUSTOMER DROPDOWN] Found customers:', customers.length);

    // Apply resource access filtering
    customers = filterByResourceAccess(customers, 'customer', req.user);

    const formattedCustomers = customers.map(customer => ({
      id: customer._id,
      label: customer.organisation?.organisation_name || 'Unnamed Customer',
      value: customer._id
    }));

    res.status(200).json({
      success: true,
      count: formattedCustomers.length,
      data: formattedCustomers
    });
  } catch (error) {
    console.error('❌ [CUSTOMER DROPDOWN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/sites - Get all sites for dropdown (with optional customer filter)
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/sites', async (req, res) => {
  try {
    const { customer_id } = req.query;
    // Allow fallback to header or query when no tenant context
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    console.log('🔍 [DROPDOWNS] Resolved tenantId:', tenantId);

    if (!tenantId) {
      console.log('❌ [SITES DROPDOWN] No tenant ID found!');
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filter.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }

    let sites = await Site.find(filter)
      .select('_id site_name customer_id')
      .sort({ site_name: 1 })
      .lean();

    console.log('🔍 [SITES DROPDOWN] Found sites:', sites.length);

    // Apply resource access filtering
    sites = filterByResourceAccess(sites, 'site', req.user);
    if (sites.length === 0) {
      console.log('⚠️ [SITES DROPDOWN] No sites found - running diagnostic queries...');

      // Check all sites in tenant
      const allSitesCount = await Site.countDocuments({ tenant_id: new mongoose.Types.ObjectId(tenantId), is_delete: false });
      console.log('🔍 [SITES DROPDOWN] Total sites in tenant (ignoring is_active):', allSitesCount);

      // Check active sites in tenant
      const activeSitesCount = await Site.countDocuments({
        tenant_id: new mongoose.Types.ObjectId(tenantId),
        is_delete: false,
        is_active: true
      });
      console.log('🔍 [SITES DROPDOWN] Active sites in tenant:', activeSitesCount);

      if (customer_id) {
        // Check all sites for customer
        const sitesForCustomer = await Site.countDocuments({
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          customer_id: customer_id,
          is_delete: false
        });
        console.log(`🔍 [SITES DROPDOWN] Sites for customer ${customer_id} (ignoring is_active):`, sitesForCustomer);

        // Check active sites for customer
        const activeSitesForCustomer = await Site.countDocuments({
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          customer_id: customer_id,
          is_delete: false,
          is_active: true
        });
        console.log(`🔍 [SITES DROPDOWN] Active sites for customer ${customer_id}:`, activeSitesForCustomer);

        // Get a sample site to see what's in the database
        const sampleSite = await Site.findOne({
          tenant_id: new mongoose.Types.ObjectId(tenantId),
          customer_id: customer_id
        }).select('_id site_name customer_id tenant_id is_active is_delete').lean();

        if (sampleSite) {
          console.log('🔍 [SITES DROPDOWN] Sample site found:', JSON.stringify(sampleSite));
        } else {
          console.log('❌ [SITES DROPDOWN] No sites exist for this customer at all');
        }
      }
    }

    const formattedSites = sites.map(site => ({
      id: site._id,
      label: site.site_name || 'Unnamed Site',
      value: site._id,
      customer_id: site.customer_id
    }));

    res.status(200).json({
      success: true,
      count: formattedSites.length,
      data: formattedSites
    });
  } catch (error) {
    console.error('❌ [SITES DROPDOWN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sites dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/buildings - Get all buildings for dropdown (with optional site and customer filter)
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/buildings', async (req, res) => {
  try {
    const { site_id, customer_id } = req.query;
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filter.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }
    if (site_id) {
      // Support multiple site IDs (comma-separated)
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filter.site_id = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }

    let buildings = await Building.find(filter)
      .select('_id building_name site_id customer_id')
      .sort({ building_name: 1 })
      .lean();

    // Apply resource access filtering
    buildings = filterByResourceAccess(buildings, 'building', req.user);

    const formattedBuildings = buildings.map(building => ({
      id: building._id,
      label: building.building_name || 'Unnamed Building',
      value: building._id,
      site_id: building.site_id,
      customer_id: building.customer_id
    }));

    res.status(200).json({
      success: true,
      count: formattedBuildings.length,
      data: formattedBuildings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching buildings dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/floors - Get all floors for dropdown (with optional building, site and customer filter)
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/floors', async (req, res) => {
  try {
    const { building_id, site_id, customer_id } = req.query;
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filter.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }
    if (site_id) {
      // Support multiple site IDs (comma-separated)
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filter.site_id = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }
    if (building_id) {
      // Support multiple building IDs (comma-separated)
      const buildingIds = building_id.includes(',')
        ? building_id.split(',').map(id => id.trim())
        : building_id;
      filter.building_id = Array.isArray(buildingIds) ? { $in: buildingIds } : buildingIds;
    }

    let floors = await Floor.find(filter)
      .select('_id floor_name floor_number building_id site_id customer_id')
      .sort({ floor_number: 1 })
      .lean();

    // Apply resource access filtering
    floors = filterByResourceAccess(floors, 'floor', req.user);

    const formattedFloors = floors.map(floor => ({
      id: floor._id,
      label: floor.floor_name || 'Unnamed Floor',
      value: floor._id,
      building_id: floor.building_id,
      site_id: floor.site_id,
      customer_id: floor.customer_id
    }));

    res.status(200).json({
      success: true,
      count: formattedFloors.length,
      data: formattedFloors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching floors dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/assets - Get all assets for dropdown (with optional filters)
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/assets', async (req, res) => {
  try {
    const { floor_id, building_id, site_id, customer_id, category, status, condition } = req.query;
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filter.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }
    if (site_id) {
      // Support multiple site IDs (comma-separated)
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filter.site_id = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }
    if (building_id) {
      // Support multiple building IDs (comma-separated)
      const buildingIds = building_id.includes(',')
        ? building_id.split(',').map(id => id.trim())
        : building_id;
      filter.building_id = Array.isArray(buildingIds) ? { $in: buildingIds } : buildingIds;
    }
    if (floor_id) {
      // Support multiple floor IDs (comma-separated)
      const floorIds = floor_id.includes(',')
        ? floor_id.split(',').map(id => id.trim())
        : floor_id;
      filter.floor_id = Array.isArray(floorIds) ? { $in: floorIds } : floorIds;
    }
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;

    let assets = await Asset.find(filter)
      .select('_id asset_no category status condition floor_id building_id site_id customer_id')
      .sort({ asset_no: 1 })
      .lean();

    // Apply resource access filtering
    assets = filterByResourceAccess(assets, 'asset', req.user);

    const formattedAssets = assets.map(asset => ({
      id: asset._id,
      label: asset.asset_no || 'Unnamed Asset',
      value: asset._id,
      asset_no: asset.asset_no,
      category: asset.category,
      status: asset.status,
      floor_id: asset.floor_id,
      building_id: asset.building_id,
      site_id: asset.site_id,
      customer_id: asset.customer_id
    }));

    res.status(200).json({
      success: true,
      count: formattedAssets.length,
      data: formattedAssets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching assets dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/tenants - Get all tenants for dropdown (with optional building filter)
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/tenants', async (req, res) => {
  try {
    const { building_id, site_id, customer_id, floor_id, tenant_status } = req.query;
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (customer_id) {
      // Support multiple customer IDs (comma-separated)
      const customerIds = customer_id.includes(',')
        ? customer_id.split(',').map(id => id.trim())
        : customer_id;
      filter.customer_id = Array.isArray(customerIds) ? { $in: customerIds } : customerIds;
    }
    if (site_id) {
      // Support multiple site IDs (comma-separated)
      const siteIds = site_id.includes(',')
        ? site_id.split(',').map(id => id.trim())
        : site_id;
      filter.site_id = Array.isArray(siteIds) ? { $in: siteIds } : siteIds;
    }
    if (building_id) {
      // Support multiple building IDs (comma-separated)
      const buildingIds = building_id.includes(',')
        ? building_id.split(',').map(id => id.trim())
        : building_id;
      filter.building_id = Array.isArray(buildingIds) ? { $in: buildingIds } : buildingIds;
    }
    if (floor_id) {
      // Support multiple floor IDs (comma-separated)
      const floorIds = floor_id.includes(',')
        ? floor_id.split(',').map(id => id.trim())
        : floor_id;
      filter.floor_id = Array.isArray(floorIds) ? { $in: floorIds } : floorIds;
    }
    if (tenant_status) filter.tenant_status = tenant_status;

    let tenants = await BuildingTenant.find(filter)
      .select('_id  tenant_trading_name tenant_legal_name building_id site_id customer_id')
      .sort({ tenant_trading_name: 1 })
      .lean();

    // Apply resource access filtering
    tenants = filterByResourceAccess(tenants, 'tenant', req.user);

    const formattedTenants = tenants.map(tenant => ({
      id: tenant._id,
      label: tenant.tenant_trading_name || tenant.tenant_legal_name || 'Unnamed Tenant',
      value: tenant._id,
      tenant_name: tenant.tenant_trading_name || tenant.tenant_legal_name ,
      building_id: tenant.building_id,
      site_id: tenant.site_id,
      customer_id: tenant.customer_id
    }));

    res.status(200).json({
      success: true,
      count: formattedTenants.length,
      data: formattedTenants
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/vendors - Get all vendors for dropdown
// FILTERED by user's resource_access (Admin sees all)
router.get('/entities/vendors', async (req, res) => {
  try {
    const { category } = req.query;
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    if (category) {
      filter.category = category;
    }

    let vendors = await Vendor.find(filter)
      .select('_id contractor_name trading_name contractor_type')
      .sort({ trading_name: 1 })
      .lean();

    // Apply resource access filtering
    vendors = filterByResourceAccess(vendors, 'vendor', req.user);

    const formattedVendors = vendors.map(vendor => ({
      id: vendor._id,
      label: vendor.trading_name || vendor.contractor_name || 'Unnamed Vendor',
      value: vendor._id,
      vendor_name: vendor.trading_name || vendor.contractor_name,
      category: vendor.contractor_type
    }));

    res.status(200).json({
      success: true,
      count: formattedVendors.length,
      data: formattedVendors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vendors dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/users - Get all users for dropdown
// FILTERED by user's resource_access (Admin sees all)
// Note: Users typically don't have resource-level filtering, but pattern applied for consistency
router.get('/entities/users', async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId || req.headers['x-tenant-id'] || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const User = require('../models/User');
    const mongoose = require('mongoose');
    // Handle missing is_delete field (for documents created before the field was added)
    const filter = {
      is_active: true,
      $or: [
        { is_delete: false },
        { is_delete: { $exists: false } }
      ],
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    let users = await User.find(filter)
      .select('_id full_name email first_name last_name')
      .sort({ full_name: 1 })
      .lean();

    // Apply resource access filtering (typically returns all users in tenant for non-admin roles)
    users = filterByResourceAccess(users, 'user', req.user);

    const formattedUsers = users.map(user => ({
      id: user._id,
      label: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unnamed User',
      value: user._id,
      email: user.email
    }));

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      data: formattedUsers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/document-tags - Get all unique document tags
router.get('/document-tags', async (req, res) => {
  try {
    const tags = await Document.distinct('tags.tags');

    // Filter out empty/null values and sort
    const cleanedTags = tags
      .filter(tag => tag && tag.trim().length > 0)
      .sort();

    const formattedTags = cleanedTags.map(tag => ({
      id: tag,
      label: tag,
      value: tag
    }));

    res.status(200).json({
      success: true,
      count: formattedTags.length,
      data: formattedTags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document tags',
      error: error.message
    });
  }
});

// ===== Static Dropdown Constants (parameterized routes come last) =====

// GET /api/dropdowns - Get all dropdown values for all modules
router.get('/', async (req, res) => {
  try {
    // Get tenant ID from request context (mandatory for tenant-specific data)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      // If no tenant/auth context, serve safe fallback constants publicly
      const flattened = flattenDropdowns(DROPDOWN_CONSTANTS);
      return res.status(200).json({
        success: true,
        data: flattened,
        source: 'fallback_constants_public'
      });
    }

    console.log(`📋 Fetching dropdowns for tenant: ${tenantId}`);

    // Try to get dropdown settings from database for this tenant
    const mongoose = require('mongoose');
    let dropdownSetting = await Settings.findOne({
      tenant_id: new mongoose.Types.ObjectId(tenantId),
      setting_key: 'dropdown_values',
      is_active: true
    });

    // If no database setting exists for this tenant, create one with default values
    if (!dropdownSetting) {
      console.log(`📋 Creating default dropdown settings for tenant: ${tenantId}`);
      // Creating default dropdown settings from constants
      dropdownSetting = await Settings.create({
        tenant_id: new mongoose.Types.ObjectId(tenantId),
        setting_key: 'dropdown_values',
        category: 'system',
        setting_type: 'dropdown',
        description: 'Application-wide dropdown values for all modules',
        value: DROPDOWN_CONSTANTS,
        default_value: DROPDOWN_CONSTANTS,
        is_active: true,
        is_editable: true,
        created_by: 'system',
        updated_by: 'system'
      });
      console.log(`✅ Default dropdown settings created for tenant: ${tenantId}`);
    }

    // Return flattened structure to match frontend
    const flattened = flattenDropdowns(dropdownSetting.value);

    res.status(200).json({
      success: true,
      data: flattened,
      source: 'database',
      tenant_id: tenantId,
      last_updated: dropdownSetting.updated_at
    });
  } catch (error) {
    console.error('Error fetching dropdown settings:', error);

    // Fallback to constants if database fails
    const flattened = flattenDropdowns(DROPDOWN_CONSTANTS);

    res.status(200).json({
      success: true,
      data: flattened,
      source: 'fallback_constants',
      warning: 'Using fallback constants due to database error'
    });
  }
});

// POST /api/dropdowns - Update all dropdown values
// This endpoint now persists changes to the database
router.post('/', async (req, res) => {
  try {
    // Get tenant ID from request context (mandatory for tenant-specific data)
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const flattenedUpdates = req.body;

    // Convert flattened format back to nested structure
    const nestedUpdates = unflattenDropdowns(flattenedUpdates);

    // Get or create dropdown setting for this tenant
    const mongoose = require('mongoose');
    let dropdownSetting = await Settings.findOne({
      tenant_id: new mongoose.Types.ObjectId(tenantId),
      setting_key: 'dropdown_values'
    });

    if (!dropdownSetting) {
      // Create new setting with updates for this tenant
      dropdownSetting = await Settings.create({
        tenant_id: new mongoose.Types.ObjectId(tenantId),
        setting_key: 'dropdown_values',
        category: 'system',
        setting_type: 'dropdown',
        description: 'Application-wide dropdown values for all modules',
        value: nestedUpdates,
        default_value: DROPDOWN_CONSTANTS,
        is_active: true,
        is_editable: true,
        created_by: req.body.updated_by || 'user',
        updated_by: req.body.updated_by || 'user'
      });
    } else {
      // Update existing setting for this tenant
      dropdownSetting.value = nestedUpdates;
      dropdownSetting.updated_by = req.body.updated_by || 'user';
      dropdownSetting.updated_at = new Date();
      await dropdownSetting.save();
    }

    // Return flattened structure to match frontend
    const flattened = flattenDropdowns(dropdownSetting.value);

    res.status(200).json({
      success: true,
      message: 'Dropdown values updated successfully and saved to database',
      data: flattened,
      tenant_id: tenantId,
      last_updated: dropdownSetting.updated_at
    });
  } catch (error) {
    console.error('Error updating dropdown values:', error);

    res.status(500).json({
      success: false,
      message: 'Error updating dropdown values',
      error: error.message
    });
  }
});

// GET /api/dropdowns/:module/:field - Get specific field dropdown values
router.get('/:module/:field', async (req, res) => {
  try {
    const { module, field } = req.params;

    // Get dropdown settings from database
    let dropdownSetting = await Settings.findOne({
      setting_key: 'dropdown_values',
      is_active: true
    });

    // Use constants as fallback
    const dropdownSource = dropdownSetting ? dropdownSetting.value : DROPDOWN_CONSTANTS;

    // Check if module exists
    if (!dropdownSource[module]) {
      return res.status(404).json({
        success: false,
        message: `Module '${module}' not found`,
        availableModules: Object.keys(dropdownSource)
      });
    }

    // Check if field exists in module
    if (!dropdownSource[module][field]) {
      return res.status(404).json({
        success: false,
        message: `Field '${field}' not found in module '${module}'`,
        availableFields: Object.keys(dropdownSource[module])
      });
    }

    res.status(200).json({
      success: true,
      module: module,
      field: field,
      data: dropdownSource[module][field],
      source: dropdownSetting ? 'database' : 'fallback_constants'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching field dropdown values',
      error: error.message
    });
  }
});

// GET /api/dropdowns/:module - Get dropdown values for a specific module
// This MUST be last because it's the most generic parameterized route
router.get('/:module', async (req, res) => {
  try {
    const { module } = req.params;

    // Get dropdown settings from database
    let dropdownSetting = await Settings.findOne({
      setting_key: 'dropdown_values',
      is_active: true
    });

    // Use constants as fallback
    const dropdownSource = dropdownSetting ? dropdownSetting.value : DROPDOWN_CONSTANTS;

    // Check if module exists
    if (!dropdownSource[module]) {
      return res.status(404).json({
        success: false,
        message: `Module '${module}' not found`,
        availableModules: Object.keys(dropdownSource)
      });
    }

    res.status(200).json({
      success: true,
      module: module,
      data: dropdownSource[module],
      source: dropdownSetting ? 'database' : 'fallback_constants'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching module dropdown values',
      error: error.message
    });
  }
});

module.exports = router;
