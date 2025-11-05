/**
 * Hierarchy Lookup Utility
 *
 * Auto-populates parent entity IDs from child entity selections in forms.
 * Enables users with limited permissions (e.g., Building Managers) to create
 * entities without seeing/selecting parent dropdowns (e.g., Customer, Site).
 *
 * Hierarchy structure:
 * Customer → Site → Building → Floor
 *                 ↘ Tenant
 *                 ↘ Asset (can be at building or floor level)
 *
 * Example:
 * - User selects Floor 5 → lookup Building → lookup Site → lookup Customer
 * - User selects Building B → lookup Site → lookup Customer
 *
 * @module hierarchyLookup
 */

const mongoose = require('mongoose');
const Floor = require('../models/Floor');
const Building = require('../models/Building');
const Site = require('../models/Site');
const Tenant = require('../models/Tenant');
const Asset = require('../models/Asset');

/**
 * Resolves parent entity IDs from child entity selections
 *
 * @param {Object} data - Input data object containing entity IDs
 * @param {string} [data.customer_id] - Customer ID
 * @param {string} [data.site_id] - Site ID
 * @param {string} [data.building_id] - Building ID
 * @param {string} [data.floor_id] - Floor ID
 * @param {string} [data.tenant_id] - Tenant ID (building tenant/occupant)
 * @param {string[]} [data.asset_ids] - Asset IDs
 * @returns {Promise<Object>} Data object with resolved parent IDs
 *
 * @example
 * // User selected only building_id
 * const input = { building_id: '507f1f77bcf86cd799439011' };
 * const resolved = await resolveHierarchy(input);
 * // resolved = {
 * //   building_id: '507f1f77bcf86cd799439011',
 * //   site_id: '507f1f77bcf86cd799439012',
 * //   customer_id: '507f1f77bcf86cd799439013'
 * // }
 */
async function resolveHierarchy(data) {
  try {
    // Create a copy to avoid mutating input
    const resolved = { ...data };

    // Step 1: Resolve from floor_id if provided
    if (resolved.floor_id && !resolved.building_id) {
      const floor = await Floor.findById(resolved.floor_id)
        .select('building_id site_id customer_id')
        .lean();

      if (floor) {
        resolved.building_id = resolved.building_id || floor.building_id?.toString();
        resolved.site_id = resolved.site_id || floor.site_id?.toString();
        resolved.customer_id = resolved.customer_id || floor.customer_id?.toString();
      }
    }

    // Step 2: Resolve from tenant_id if provided (building tenants/occupants)
    if (resolved.tenant_id && !resolved.building_id) {
      const tenant = await Tenant.findById(resolved.tenant_id)
        .select('building_id site_id customer_id')
        .lean();

      if (tenant) {
        resolved.building_id = resolved.building_id || tenant.building_id?.toString();
        resolved.site_id = resolved.site_id || tenant.site_id?.toString();
        resolved.customer_id = resolved.customer_id || tenant.customer_id?.toString();
      }
    }

    // Step 3: Resolve from first asset_id if provided (for documents)
    // Assets can be at building or floor level
    if (resolved.asset_ids && resolved.asset_ids.length > 0 && !resolved.building_id) {
      const asset = await Asset.findById(resolved.asset_ids[0])
        .select('building_id floor_id site_id customer_id')
        .lean();

      if (asset) {
        resolved.building_id = resolved.building_id || asset.building_id?.toString();
        resolved.floor_id = resolved.floor_id || asset.floor_id?.toString();
        resolved.site_id = resolved.site_id || asset.site_id?.toString();
        resolved.customer_id = resolved.customer_id || asset.customer_id?.toString();
      }
    }

    // Step 4: Resolve from building_id if provided
    // Empty strings are treated as missing values
    const hasSiteId = resolved.site_id && resolved.site_id !== '';
    const hasCustomerId = resolved.customer_id && resolved.customer_id !== '';

    if (resolved.building_id && (!hasSiteId || !hasCustomerId)) {
      const building = await Building.findById(resolved.building_id)
        .select('site_id customer_id')
        .lean();

      if (building) {
        // Only populate if not already set (or if empty string)
        if (!hasSiteId && building.site_id) {
          resolved.site_id = building.site_id.toString();
        }
        if (!hasCustomerId && building.customer_id) {
          resolved.customer_id = building.customer_id.toString();
        }
      }
    }

    // Step 5: Resolve from site_id if provided
    const hasCustomerIdAfterBuilding = resolved.customer_id && resolved.customer_id !== '';

    if (resolved.site_id && resolved.site_id !== '' && !hasCustomerIdAfterBuilding) {
      const site = await Site.findById(resolved.site_id)
        .select('customer_id')
        .lean();

      if (site && site.customer_id) {
        resolved.customer_id = site.customer_id.toString();
      }
    }

    return resolved;
  } catch (error) {
    console.error('Error in resolveHierarchy:', error);
    // Return original data if lookup fails (don't block the operation)
    return data;
  }
}

/**
 * Validates that resolved parent IDs match expected values (if provided)
 * Prevents users from creating inconsistent hierarchies
 *
 * @param {Object} data - Data object with resolved IDs
 * @returns {Promise<{valid: boolean, errors: string[]}>} Validation result
 */
async function validateHierarchy(data) {
  const errors = [];

  try {
    // If both floor and building provided, verify floor belongs to building
    if (data.floor_id && data.building_id) {
      const floor = await Floor.findById(data.floor_id).select('building_id').lean();
      if (floor && floor.building_id.toString() !== data.building_id) {
        errors.push('Floor does not belong to the specified building');
      }
    }

    // If both building and site provided, verify building belongs to site
    if (data.building_id && data.site_id) {
      const building = await Building.findById(data.building_id).select('site_id').lean();
      if (building && building.site_id.toString() !== data.site_id) {
        errors.push('Building does not belong to the specified site');
      }
    }

    // If both site and customer provided, verify site belongs to customer
    if (data.site_id && data.customer_id) {
      const site = await Site.findById(data.site_id).select('customer_id').lean();
      if (site && site.customer_id.toString() !== data.customer_id) {
        errors.push('Site does not belong to the specified customer');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Error in validateHierarchy:', error);
    return {
      valid: false,
      errors: ['Failed to validate hierarchy: ' + error.message]
    };
  }
}

module.exports = {
  resolveHierarchy,
  validateHierarchy
};
