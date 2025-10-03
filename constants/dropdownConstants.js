// Dropdown Constants for all modules
// Fulqrom Hub - Australian Commercial Real Estate & HVAC Building Management

const DROPDOWN_CONSTANTS = {
  // Customer module dropdowns
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
    ]
  }
};

module.exports = DROPDOWN_CONSTANTS;
