const express = require('express');
const DROPDOWN_CONSTANTS = require('../constants/dropdownConstants');
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');
const Document = require('../models/Document');

const router = express.Router();

// Helper function to flatten nested structure to match frontend format
// Converts { customer: { industry_types: [...] } } to { customer_industry_types: [...] }
function flattenDropdowns(nested) {
  const flattened = {};

  Object.keys(nested).forEach(module => {
    Object.keys(nested[module]).forEach(field => {
      const flatKey = `${module}_${field}`;
      flattened[flatKey] = nested[module][field];
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

// ===== Entity Dropdown Endpoints (must be before parameterized routes) =====

// GET /api/dropdowns/entities/customers - Get all customers for dropdown
router.get('/entities/customers', async (req, res) => {
  try {
    const customers = await Customer.find({ is_active: true })
      .select('_id organisation.organisation_name')
      .sort({ 'organisation.organisation_name': 1 })
      .lean();

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
    res.status(500).json({
      success: false,
      message: 'Error fetching customers dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/sites - Get all sites for dropdown (with optional customer filter)
router.get('/entities/sites', async (req, res) => {
  try {
    const { customer_id } = req.query;
    const filter = { is_active: true };

    if (customer_id) {
      filter.customer_id = customer_id;
    }

    const sites = await Site.find(filter)
      .select('_id site_name customer_id')
      .sort({ site_name: 1 })
      .lean();

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
    res.status(500).json({
      success: false,
      message: 'Error fetching sites dropdown',
      error: error.message
    });
  }
});

// GET /api/dropdowns/entities/buildings - Get all buildings for dropdown (with optional site filter)
router.get('/entities/buildings', async (req, res) => {
  try {
    const { site_id } = req.query;
    const filter = { is_active: true };

    if (site_id) {
      filter.site_id = site_id;
    }

    const buildings = await Building.find(filter)
      .select('_id building_name site_id')
      .sort({ building_name: 1 })
      .lean();

    const formattedBuildings = buildings.map(building => ({
      id: building._id,
      label: building.building_name || 'Unnamed Building',
      value: building._id,
      site_id: building.site_id
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

// GET /api/dropdowns/entities/floors - Get all floors for dropdown (with optional building filter)
router.get('/entities/floors', async (req, res) => {
  try {
    const { building_id } = req.query;
    const filter = { is_active: true };

    if (building_id) {
      filter.building_id = building_id;
    }

    const floors = await Floor.find(filter)
      .select('_id floor_name building_id')
      .sort({ floor_name: 1 })
      .lean();

    const formattedFloors = floors.map(floor => ({
      id: floor._id,
      label: floor.floor_name || 'Unnamed Floor',
      value: floor._id,
      building_id: floor.building_id
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
router.get('/entities/assets', async (req, res) => {
  try {
    const { floor_id, building_id, site_id, customer_id, category, status, condition } = req.query;
    const filter = { is_active: true };

    if (customer_id) filter.customer_id = customer_id;
    if (floor_id) filter.floor_id = floor_id;
    if (building_id) filter.building_id = building_id;
    if (site_id) filter.site_id = site_id;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;

    const assets = await Asset.find(filter)
      .select('_id asset_no category status condition floor_id building_id site_id customer_id')
      .sort({ asset_no: 1 })
      .lean();

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
router.get('/entities/tenants', async (req, res) => {
  try {
    const { building_id, site_id, customer_id, floor_id, tenant_status } = req.query;
    const filter = { is_active: true };

    if (customer_id) filter.customer_id = customer_id;
    if (site_id) filter.site_id = site_id;
    if (building_id) filter.building_id = building_id;
    if (floor_id) filter.floor_id = floor_id;
    if (tenant_status) filter.tenant_status = tenant_status;

    const tenants = await Tenant.find(filter)
      .select('_id tenant_name building_id site_id customer_id')
      .sort({ tenant_name: 1 })
      .lean();

    const formattedTenants = tenants.map(tenant => ({
      id: tenant._id,
      label: tenant.tenant_name || 'Unnamed Tenant',
      value: tenant._id,
      tenant_name: tenant.tenant_name,
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
router.get('/entities/vendors', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { is_active: true };

    if (category) {
      filter.category = category;
    }

    const vendors = await Vendor.find(filter)
      .select('_id name category')
      .sort({ name: 1 })
      .lean();

    const formattedVendors = vendors.map(vendor => ({
      id: vendor._id,
      label: vendor.name || 'Unnamed Vendor',
      value: vendor._id,
      vendor_name: vendor.name,
      category: vendor.category
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
    // Return flattened structure to match frontend
    const flattened = flattenDropdowns(DROPDOWN_CONSTANTS);

    res.status(200).json({
      success: true,
      data: flattened
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dropdown values',
      error: error.message
    });
  }
});

// POST /api/dropdowns - Update all dropdown values
// Note: This endpoint updates the in-memory constants
// For persistent storage, you would need to implement database storage
router.post('/', async (req, res) => {
  try {
    const flattenedUpdates = req.body;

    // Convert flattened format back to nested structure
    const nestedUpdates = unflattenDropdowns(flattenedUpdates);

    // Update the constants (in-memory only)
    // For production, you would want to persist this to a database
    Object.keys(nestedUpdates).forEach(module => {
      if (DROPDOWN_CONSTANTS[module]) {
        Object.keys(nestedUpdates[module]).forEach(field => {
          DROPDOWN_CONSTANTS[module][field] = nestedUpdates[module][field];
        });
      }
    });

    // Return flattened structure to match frontend
    const flattened = flattenDropdowns(DROPDOWN_CONSTANTS);

    res.status(200).json({
      success: true,
      message: 'Dropdown values updated successfully',
      data: flattened
    });
  } catch (error) {
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

    // Check if module exists
    if (!DROPDOWN_CONSTANTS[module]) {
      return res.status(404).json({
        success: false,
        message: `Module '${module}' not found`,
        availableModules: Object.keys(DROPDOWN_CONSTANTS)
      });
    }

    // Check if field exists in module
    if (!DROPDOWN_CONSTANTS[module][field]) {
      return res.status(404).json({
        success: false,
        message: `Field '${field}' not found in module '${module}'`,
        availableFields: Object.keys(DROPDOWN_CONSTANTS[module])
      });
    }

    res.status(200).json({
      success: true,
      module: module,
      field: field,
      data: DROPDOWN_CONSTANTS[module][field]
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

    // Check if module exists in constants
    if (!DROPDOWN_CONSTANTS[module]) {
      return res.status(404).json({
        success: false,
        message: `Module '${module}' not found`,
        availableModules: Object.keys(DROPDOWN_CONSTANTS)
      });
    }

    res.status(200).json({
      success: true,
      module: module,
      data: DROPDOWN_CONSTANTS[module]
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
