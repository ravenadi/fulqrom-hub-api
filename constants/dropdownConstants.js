// Dropdown Constants for all modules
// Fulqrom Hub - Australian Commercial Real Estate & HVAC Building Management

// NOTE: These constants are now loaded from the database via GET /api/dropdowns
// This file serves as the default/fallback values for the dropdown API
// The actual dropdown values are stored in the Settings collection with setting_key='dropdown_values'
// and can be managed dynamically through the API

const DROPDOWN_CONSTANTS = {
  // Customer module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as customer_industry_types)
  customer: {
    industry_types: [
      'Commercial Real Estate',
      'Property Management',
      'HVAC Services',
      'Facility Management',
      'Building Maintenance',
      'Energy Management',
      'Construction',
      'Engineering Services'
    ]
  },

  // Contact module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as contact_role_types, contact_contact_types, contact_platform_access)
  contact: {
    role_types: [
      'Primary',
      'Secondary',
      'Emergency',
      'Technical',
      'Financial',
      'Other'
    ],
    contact_types: [
      'Internal',
      'External',
      'Contractor',
      'Vendor',
      'Consultant',
      'Other'
    ],
    platform_access: [
      'Admin',
      'Operational',
      'View Only',
      'None'
    ]
  },

  // Site module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as site_site_types, site_site_statuses, etc.)
  site: {
    site_types: [
      'Commercial Office',
      'Retail',
      'Industrial',
      'Mixed Use',
      'Warehouse',
      'Data Centre'
    ],
    site_statuses: [
      'Active',
      'Under Construction',
      'Planning',
      'Inactive',
      'Maintenance'
    ],
    site_security_levels: [
      'Public',
      'Restricted',
      'Confidential',
      'High Security'
    ],
    site_states: [
      'NSW',
      'VIC',
      'QLD',
      'WA',
      'SA',
      'TAS',
      'ACT',
      'NT'
    ]
  },

  // Building module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as building_building_types, building_building_statuses)
  building: {
    building_types: [
      'Office',
      'Retail',
      'Industrial',
      'Mixed Use',
      'Warehouse',
      'Data Centre',
      'Healthcare',
      'Educational'
    ],
    building_statuses: [
      'Active',
      'Under Construction',
      'Renovation',
      'Vacant',
      'Demolished'
    ]
  },

  // Floor module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as floor_floor_types, floor_floor_statuses, floor_floor_area_units)
  floor: {
    floor_types: [
      'Office',
      'Retail',
      'Plant Room',
      'Lab',
      'Common Area',
      'Residential',
      'Storage'
    ],
    floor_statuses: [
      'Active',
      'Under Construction',
      'Renovation',
      'Vacant',
      'Maintenance'
    ],
    floor_area_units: [
      'm²',
      'sq ft'
    ]
  },

  // Tenant module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as tenant_tenant_industry_types, tenant_tenant_lease_statuses, etc.)
  tenant: {
    tenant_industry_types: [
      'Technology',
      'Finance',
      'Healthcare',
      'Retail',
      'Professional Services',
      'Manufacturing',
      'Government',
      'Education',
      'Other'
    ],
    tenant_lease_statuses: [
      'Active',
      'Pending',
      'Expired',
      'Terminated',
      'Under Negotiation',
      'Renewed'
    ],
    tenant_area_units: [
      'm²',
      'sq ft'
    ],
    tenant_rent_frequencies: [
      'Weekly',
      'Fortnightly',
      'Monthly',
      'Quarterly',
      'Annually'
    ]
  },

  // Document module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as document_document_types, document_document_categories, etc.)
  document: {
    document_types: [
      'PDF',
      'Word',
      'Excel',
      'Image',
      'CAD',
      'BIM',
      'Other'
    ],
    document_categories: [
      'Drawing Register',
      'Compliance & Regulatory',
      'Standards & Procedures',
      'Building Management',
      'General Repository'
    ],
    document_statuses: [
      'Draft',
      'Under Review',
      'Approved',
      'Archived',
      'Rejected'
    ],
    document_engineering_disciplines: [
      'Mechanical',
      'Electrical',
      'Plumbing',
      'Structural',
      'Civil',
      'Fire Protection',
      'HVAC',
      'Telecommunications'
    ],
    document_approval_statuses: [
      'Pending',
      'Approved',
      'Rejected',
      'Under Review'
    ]
  }
};

module.exports = DROPDOWN_CONSTANTS;
