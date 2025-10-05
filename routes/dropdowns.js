const express = require('express');
const DROPDOWN_CONSTANTS = require('../constants/dropdownConstants');
const Settings = require('../models/Settings');
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
      .select('_id  tenant_trading_name tenant_legal_name building_id site_id customer_id')
      .sort({ tenant_trading_name: 1, tenant_legal_name: 1, tenant_name: 1 })
      .lean();

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
router.get('/entities/vendors', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { is_active: true };

    if (category) {
      filter.category = category;
    }

    const vendors = await Vendor.find(filter)
      .select('_id contractor_name trading_name contractor_type')
      .sort({ trading_name: 1, contractor_name: 1 })
      .lean();

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
    // Try to get dropdown settings from database
    let dropdownSetting = await Settings.findOne({
      setting_key: 'dropdown_values',
      is_active: true
    });

    // If no database setting exists, create one with default values
    if (!dropdownSetting) {
      console.log('No dropdown settings found in database, creating default...');
      dropdownSetting = await Settings.create({
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
    }

    // Return flattened structure to match frontend
    const flattened = flattenDropdowns(dropdownSetting.value);

    res.status(200).json({
      success: true,
      data: flattened,
      source: 'database',
      last_updated: dropdownSetting.updated_at
    });
  } catch (error) {
    console.error('Error fetching dropdown values:', error);

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
    const flattenedUpdates = req.body;

    // Convert flattened format back to nested structure
    const nestedUpdates = unflattenDropdowns(flattenedUpdates);

    // Get or create dropdown setting
    let dropdownSetting = await Settings.findOne({
      setting_key: 'dropdown_values'
    });

    if (!dropdownSetting) {
      // Create new setting with updates
      dropdownSetting = await Settings.create({
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
      // Update existing setting
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
