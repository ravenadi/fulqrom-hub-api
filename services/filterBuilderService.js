/**
 * Filter Builder Service
 * Centralized service for building MongoDB query filters from request parameters.
 * Eliminates repeated filter parsing logic across route files.
 *
 * @module services/filterBuilderService
 */

class FilterBuilderService {
  /**
   * Parse a comma-separated string into an array, or return the single value
   * @param {string} value - The value to parse (may be comma-separated)
   * @returns {string|string[]} - Single value or array of values
   */
  parseMultiSelect(value) {
    if (!value) return null;

    if (value.includes(',')) {
      return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }
    return value;
  }

  /**
   * Build a filter condition for a field that supports multi-select (comma-separated values)
   * @param {string} value - The query parameter value
   * @returns {Object|string|null} - MongoDB filter condition or null if no value
   *
   * @example
   * // Single value
   * buildMultiSelectFilter('active') // returns 'active'
   *
   * // Multiple values
   * buildMultiSelectFilter('active,pending') // returns { $in: ['active', 'pending'] }
   */
  buildMultiSelectFilter(value) {
    const parsed = this.parseMultiSelect(value);
    if (!parsed) return null;

    return Array.isArray(parsed) ? { $in: parsed } : parsed;
  }

  /**
   * Build a case-insensitive regex filter for text search
   * @param {string} value - The search value
   * @returns {RegExp|null} - MongoDB regex or null if no value
   */
  buildRegexFilter(value) {
    if (!value || typeof value !== 'string') return null;
    return new RegExp(this.escapeRegex(value), 'i');
  }

  /**
   * Build a range filter for numeric fields (min/max)
   * @param {string|number} min - Minimum value
   * @param {string|number} max - Maximum value
   * @param {string} type - 'int' or 'float'
   * @returns {Object|null} - MongoDB filter condition or null if no values
   *
   * @example
   * buildRangeFilter('10', '100', 'int') // returns { $gte: 10, $lte: 100 }
   * buildRangeFilter('10.5', null, 'float') // returns { $gte: 10.5 }
   */
  buildRangeFilter(min, max, type = 'float') {
    const parser = type === 'int' ? parseInt : parseFloat;
    const filter = {};

    if (min !== undefined && min !== null && min !== '') {
      const parsedMin = parser(min);
      if (!isNaN(parsedMin)) {
        filter.$gte = parsedMin;
      }
    }

    if (max !== undefined && max !== null && max !== '') {
      const parsedMax = parser(max);
      if (!isNaN(parsedMax)) {
        filter.$lte = parsedMax;
      }
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  /**
   * Build a date range filter
   * @param {string|Date} startDate - Start date
   * @param {string|Date} endDate - End date
   * @returns {Object|null} - MongoDB filter condition or null if no values
   */
  buildDateRangeFilter(startDate, endDate) {
    const filter = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        filter.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        // Set to end of day
        end.setHours(23, 59, 59, 999);
        filter.$lte = end;
      }
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  /**
   * Parse a boolean query parameter
   * @param {string|boolean} value - The value to parse
   * @returns {boolean|null} - Parsed boolean or null if undefined
   */
  parseBoolean(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }

  /**
   * Build a text search filter across multiple fields
   * @param {string} searchTerm - The search term
   * @param {string[]} fields - Array of field names to search
   * @returns {Object|null} - MongoDB $or filter condition or null if no search term
   *
   * @example
   * buildTextSearchFilter('test', ['name', 'email'])
   * // returns { $or: [{ name: /test/i }, { email: /test/i }] }
   */
  buildTextSearchFilter(searchTerm, fields) {
    if (!searchTerm || !fields || fields.length === 0) return null;

    const regex = this.buildRegexFilter(searchTerm);
    if (!regex) return null;

    return {
      $or: fields.map(field => ({ [field]: regex }))
    };
  }

  /**
   * Escape special regex characters in a string
   * @param {string} string - The string to escape
   * @returns {string} - Escaped string safe for regex
   */
  escapeRegex(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Apply a filter to the query if the value is not null/undefined
   * @param {Object} filterQuery - The filter query object to modify
   * @param {string} field - The field name
   * @param {*} value - The filter value
   * @returns {Object} - The modified filter query
   */
  applyFilter(filterQuery, field, value) {
    if (value !== null && value !== undefined) {
      filterQuery[field] = value;
    }
    return filterQuery;
  }

  /**
   * Build filters for common entity hierarchy (customer, site, building, floor)
   * @param {Object} params - Query parameters
   * @returns {Object} - Filter conditions for hierarchy fields
   */
  buildHierarchyFilters(params) {
    const filters = {};

    const { customer_id, site_id, building_id, floor_id } = params;

    const customerFilter = this.buildMultiSelectFilter(customer_id);
    if (customerFilter) filters.customer_id = customerFilter;

    const siteFilter = this.buildMultiSelectFilter(site_id);
    if (siteFilter) filters.site_id = siteFilter;

    const buildingFilter = this.buildMultiSelectFilter(building_id);
    if (buildingFilter) filters.building_id = buildingFilter;

    const floorFilter = this.buildMultiSelectFilter(floor_id);
    if (floorFilter) filters.floor_id = floorFilter;

    return filters;
  }

  /**
   * Build a complete filter query from request parameters for assets
   * @param {Object} params - Query parameters from request
   * @param {string} tenantId - The tenant ID for mandatory filtering
   * @returns {Object} - Complete MongoDB filter query
   */
  buildAssetFilters(params, tenantId) {
    const filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }
    };

    // Hierarchy filters
    Object.assign(filterQuery, this.buildHierarchyFilters(params));

    // Multi-select filters
    const multiSelectFields = [
      'category', 'status', 'condition', 'criticality_level',
      'level', 'service_status', 'test_result'
    ];

    multiSelectFields.forEach(field => {
      const filter = this.buildMultiSelectFilter(params[field]);
      if (filter) filterQuery[field] = filter;
    });

    // Regex text filters
    const regexFields = ['make', 'model', 'area', 'asset_no', 'refrigerant', 'owner'];
    regexFields.forEach(field => {
      const filter = this.buildRegexFilter(params[field]);
      if (filter) filterQuery[field] = filter;
    });

    // Exact match filters
    if (params.device_id) filterQuery.device_id = params.device_id;
    if (params.asset_id) filterQuery.asset_id = params.asset_id;

    // Range filters
    const ageRange = this.buildRangeFilter(params.age_min, params.age_max, 'int');
    if (ageRange) filterQuery.age = ageRange;

    const purchaseCostRange = this.buildRangeFilter(params.purchase_cost_min, params.purchase_cost_max, 'float');
    if (purchaseCostRange) filterQuery.purchase_cost_aud = purchaseCostRange;

    const currentValueRange = this.buildRangeFilter(params.current_value_min, params.current_value_max, 'float');
    if (currentValueRange) filterQuery.current_book_value_aud = currentValueRange;

    // Boolean filter
    const isActive = this.parseBoolean(params.is_active);
    if (isActive !== null) filterQuery.is_active = isActive;

    // Text search across multiple fields
    if (params.search) {
      const searchFields = [
        'asset_no', 'asset_id', 'device_id', 'make', 'model',
        'serial', 'area', 'category', 'type', 'status',
        'criticality_level', 'owner', 'service_status'
      ];
      const searchFilter = this.buildTextSearchFilter(params.search, searchFields);
      if (searchFilter) Object.assign(filterQuery, searchFilter);
    }

    return filterQuery;
  }

  /**
   * Build a complete filter query from request parameters for documents
   * @param {Object} params - Query parameters from request
   * @param {string} tenantId - The tenant ID for mandatory filtering
   * @returns {Object} - Complete MongoDB filter query
   */
  buildDocumentFilters(params, tenantId) {
    const filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }
    };

    // Customer filter
    const customerFilter = this.buildMultiSelectFilter(params.customer_id);
    if (customerFilter) {
      filterQuery['customer.customer_id'] = customerFilter;
    }

    // Location hierarchy filters
    const siteFilter = this.buildMultiSelectFilter(params.site_id);
    if (siteFilter) filterQuery['location.site.site_id'] = siteFilter;

    const buildingFilter = this.buildMultiSelectFilter(params.building_id);
    if (buildingFilter) filterQuery['location.building.building_id'] = buildingFilter;

    const floorFilter = this.buildMultiSelectFilter(params.floor_id);
    if (floorFilter) filterQuery['location.floor.floor_id'] = floorFilter;

    const assetFilter = this.buildMultiSelectFilter(params.asset_id);
    if (assetFilter) filterQuery['location.asset.asset_id'] = assetFilter;

    const tenantFilter = this.buildMultiSelectFilter(params.tenant_id);
    if (tenantFilter) filterQuery['location.tenant.tenant_id'] = tenantFilter;

    const vendorFilter = this.buildMultiSelectFilter(params.vendor_id);
    if (vendorFilter) filterQuery['location.vendor.vendor_id'] = vendorFilter;

    // Document-specific multi-select filters
    const multiSelectFields = [
      { param: 'category', field: 'category' },
      { param: 'type', field: 'document_type' },
      { param: 'document_types', field: 'document_type' },
      { param: 'status', field: 'status' },
      { param: 'engineering_discipline', field: 'engineering_discipline' },
      { param: 'regulatory_framework', field: 'regulatory_framework' },
      { param: 'compliance_status', field: 'compliance_status' },
      { param: 'drawing_status', field: 'drawing_status' },
      { param: 'access_level', field: 'access_level' }
    ];

    multiSelectFields.forEach(({ param, field }) => {
      const filter = this.buildMultiSelectFilter(params[param]);
      if (filter) filterQuery[field] = filter;
    });

    // Tag filters (special handling for array field)
    const tags = params.tags || params.tag;
    if (tags) {
      const tagArray = this.parseMultiSelect(tags);
      if (tagArray) {
        if (Array.isArray(tagArray)) {
          // Match documents that have ANY of the specified tags
          filterQuery.tags = { $in: tagArray.map(t => new RegExp(`^${this.escapeRegex(t)}$`, 'i')) };
        } else {
          filterQuery.tags = { $regex: new RegExp(`^${this.escapeRegex(tagArray)}$`, 'i') };
        }
      }
    }

    // User filters
    if (params.prepared_by) filterQuery.prepared_by = params.prepared_by;
    if (params.approved_by_user) filterQuery['approval.approved_by_user'] = params.approved_by_user;

    // Date range filters
    const createdDateRange = this.buildDateRangeFilter(params.created_from, params.created_to);
    if (createdDateRange) filterQuery.createdAt = createdDateRange;

    const updatedDateRange = this.buildDateRangeFilter(params.updated_from, params.updated_to);
    if (updatedDateRange) filterQuery.updatedAt = updatedDateRange;

    // Text search
    if (params.search) {
      const searchFields = [
        'document_name', 'document_type', 'description', 'tags',
        'category', 'engineering_discipline'
      ];
      const searchFilter = this.buildTextSearchFilter(params.search, searchFields);
      if (searchFilter) Object.assign(filterQuery, searchFilter);
    }

    return filterQuery;
  }

  /**
   * Build a complete filter query for buildings
   * @param {Object} params - Query parameters from request
   * @param {string} tenantId - The tenant ID for mandatory filtering
   * @returns {Object} - Complete MongoDB filter query
   */
  buildBuildingFilters(params, tenantId) {
    const filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }
    };

    // Hierarchy filters
    const customerFilter = this.buildMultiSelectFilter(params.customer_id);
    if (customerFilter) filterQuery.customer_id = customerFilter;

    const siteFilter = this.buildMultiSelectFilter(params.site_id);
    if (siteFilter) filterQuery.site_id = siteFilter;

    // Building-specific filters
    const buildingTypeFilter = this.buildMultiSelectFilter(params.building_type);
    if (buildingTypeFilter) filterQuery.building_type = buildingTypeFilter;

    const operationalStatusFilter = this.buildMultiSelectFilter(params.operational_status);
    if (operationalStatusFilter) filterQuery.operational_status = operationalStatusFilter;

    // Tags filter
    const tags = params.tags;
    if (tags) {
      const tagArray = this.parseMultiSelect(tags);
      if (tagArray) {
        filterQuery.tags = Array.isArray(tagArray) ? { $in: tagArray } : tagArray;
      }
    }

    // Text search
    if (params.search) {
      const searchFields = ['building_name', 'building_code', 'building_type'];
      const searchFilter = this.buildTextSearchFilter(params.search, searchFields);
      if (searchFilter) Object.assign(filterQuery, searchFilter);
    }

    return filterQuery;
  }

  /**
   * Build a complete filter query for sites
   * @param {Object} params - Query parameters from request
   * @param {string} tenantId - The tenant ID for mandatory filtering
   * @returns {Object} - Complete MongoDB filter query
   */
  buildSiteFilters(params, tenantId) {
    const filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }
    };

    // Customer filter
    const customerFilter = this.buildMultiSelectFilter(params.customer_id);
    if (customerFilter) filterQuery.customer_id = customerFilter;

    // Site-specific filters
    const statusFilter = this.buildMultiSelectFilter(params.status);
    if (statusFilter) filterQuery.status = statusFilter;

    // Text search
    if (params.search) {
      const searchFields = ['site_name', 'site_code'];
      const searchFilter = this.buildTextSearchFilter(params.search, searchFields);
      if (searchFilter) Object.assign(filterQuery, searchFilter);
    }

    return filterQuery;
  }

  /**
   * Build a complete filter query for customers
   * @param {Object} params - Query parameters from request
   * @param {string} tenantId - The tenant ID for mandatory filtering
   * @returns {Object} - Complete MongoDB filter query
   */
  buildCustomerFilters(params, tenantId) {
    const filterQuery = {
      tenant_id: tenantId,
      is_delete: { $ne: true }
    };

    // Status filter
    const statusFilter = this.buildMultiSelectFilter(params.status);
    if (statusFilter) filterQuery.status = statusFilter;

    // Boolean filter
    const isActive = this.parseBoolean(params.is_active);
    if (isActive !== null) filterQuery.is_active = isActive;

    // Text search
    if (params.search) {
      const searchFields = [
        'organisation.organisation_name',
        'company_profile.trading_name',
        'company_profile.abn',
        'company_profile.acn'
      ];
      const searchFilter = this.buildTextSearchFilter(params.search, searchFields);
      if (searchFilter) Object.assign(filterQuery, searchFilter);
    }

    return filterQuery;
  }
}

module.exports = new FilterBuilderService();
