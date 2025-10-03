const express = require('express');
const DROPDOWN_CONSTANTS = require('../constants/dropdownConstants');

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

// GET /api/dropdowns/:module - Get dropdown values for a specific module
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

module.exports = router;
