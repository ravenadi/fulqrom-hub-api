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
  // Loaded from: GET /api/dropdowns (flattened as contact_role_types, contact_types, contact_platform_access)
  contact: {
    role_types: [
      'Primary',
      'Secondary',
      'Emergency',
      'Technical',
      'Financial',
      'Other'
    ],
    types: [
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
  // Loaded from: GET /api/dropdowns (flattened as site_types, site_statuses, etc.)
  site: {
    types: [
      'Commercial Office',
      'Retail',
      'Industrial',
      'Mixed Use',
      'Warehouse',
      'Data Centre'
    ],
    statuses: [
      'Active',
      'Under Construction',
      'Planning',
      'Inactive',
      'Maintenance'
    ],
    security_levels: [
      'Public',
      'Restricted',
      'Confidential',
      'High Security'
    ],
    states: [
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
  // Loaded from: GET /api/dropdowns (flattened as building_types, building_statuses)
  building: {
    types: [
      'Office',
      'Retail',
      'Industrial',
      'Mixed Use',
      'Warehouse',
      'Data Centre',
      'Healthcare',
      'Educational'
    ],
    statuses: [
      'Active',
      'Under Construction',
      'Renovation',
      'Vacant',
      'Demolished'
    ]
  },

  // Floor module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as floor_types, floor_statuses, floor_area_units)
  floor: {
    types: [
      'Office',
      'Retail',
      'Plant Room',
      'Lab',
      'Common Area',
      'Residential',
      'Storage'
    ],
    statuses: [
      'Active',
      'Under Construction',
      'Renovation',
      'Vacant',
      'Maintenance'
    ],
    area_units: [
      'm²',
      'sq ft'
    ]
  },

  // Asset module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as asset_categories, asset_statuses, asset_criticality_levels, asset_conditions)
  asset: {
    categories: [
      'AHU',
      'Air Con',
      'Boiler System',
      'Chemical Treatment',
      'Chiller System',
      'Controls',
      'Damper',
      'Electrical',
      'Fire Safety',
      'HVAC',
      'Lift/Elevator',
      'Other Mech. Equip',
      'Plumbing',
      'Refrigeration',
      'Security',
      'TBC',
      'Ventilation'
    ],
    statuses: [
      'Operational',
      'Under Testing',
      'Maintenance Required',
      'Out of Service',
      'Decommissioned'
    ],
    criticality_levels: [
      'Critical',
      'High',
      'Medium',
      'Low'
    ],
    conditions: [
      'Excellent',
      'Good',
      'Fair',
      'Poor',
      'New',
      'Average',
      'Other'
    ]
  },

  // Tenant module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as tenant_industry_types, tenant_lease_statuses, etc.)
  tenant: {
    industry_types: [
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
    lease_statuses: [
      'Active',
      'Pending',
      'Expired',
      'Terminated',
      'Under Negotiation',
      'Renewed'
    ],
    area_units: [
      'm²',
      'sq ft'
    ],
    rent_frequencies: [
      'Weekly',
      'Fortnightly',
      'Monthly',
      'Quarterly',
      'Annually'
    ]
  },

  // Document module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as document_types, document_categories, etc.)
  document: {
    types: [
      'PDF',
      'Word',
      'Excel',
      'Image',
      'CAD',
      'BIM',
      'Other'
    ],
    categories: [
      'Operations & Maintenance (O&M) Manuals',
      'Commissioning Data (Air & Water Balance Reports)',
      'Egress Report',
      'Fire Safety Reports',
      'HVAC Drawings',
      'Electrical Schematics',
      'Plumbing & Hydraulics Drawings',
      'Mechanical Services Drawings',
      'Waste Services',
      'Building Management & Control Diagrams',
      'Construction Drawings',
      'Tender Drawings & Specifications',
      'Shop Drawings',
      'Certification Reports',
      'Warranty Certificates',
      'Service Reports',
      'Asset Registers',
      'Drawing Schedules',
      'Compliance Documents',
      'Project Management Documentation',
      'NABERS & Energy Reporting',
      'Device Register'
    ],
    statuses: [
      'Draft',
      'Under Review',
      'Approved',
      'Archived',
      'Rejected'
    ],
    engineering_disciplines: [
      'Mechanical',
      'Electrical',
      'Plumbing',
      'Structural',
      'Civil',
      'Fire Protection',
      'HVAC',
      'Telecommunications'
    ],
    approval_statuses: [
      'Pending',
      'Approved',
      'Rejected',
      'Under Review'
    ]
  },

  // Vendor module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as vendor_contractor_types, vendor_consultant_specialisations, etc.)
  vendor: {
    contractor_types: [
      'HVAC Contractor',
      'Electrical Contractor',
      'Plumbing Contractor',
      'Fire Safety Contractor',
      'Building Consultant',
      'General Contractor',
      'Maintenance Contractor',
      'Cleaning Contractor',
      'Security Contractor',
      'Construction Contractor',
      'Landscaping Contractor',
      'Pest Control Contractor'
    ],
    consultant_specialisations: [
      'Building Consultant',
      'Engineering Consultant',
      'Fire Safety Consultant',
      'Mechanical Consultant',
      'Electrical Consultant',
      'Structural Consultant',
      'Environmental Consultant',
      'Energy Consultant'
    ],
    certification_authorities: [
      'Council-appointed',
      'Private',
      'Accredited'
    ],
    services_provided: [
      'Maintenance & Repairs',
      'Installation',
      'Emergency Callout',
      'Inspections',
      'Testing & Commissioning',
      'Consultation',
      'Design',
      'Project Management',
      'Compliance & Certification',
      'Energy Audits'
    ]
  }
};

module.exports = DROPDOWN_CONSTANTS;
