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
      'Building Maintenance',
      'Commercial Real Estate',
      'Construction',
      'Energy Management',
      'Engineering Services',
      'Facility Management',
      'HVAC Services',
      'Property Management'
    ],
    organisation_sizes: [
      '1-10',
      '11-50',
      '51-200',
      '201-500',
      '501-1000',
      '1001+'
    ]
  },

  // Contact module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as contact_role_types, contact_types, contact_platform_access)
  contact: {
    role_types: [
      'Emergency',
      'Financial',
      'Other',
      'Primary',
      'Secondary',
      'Technical'
    ],
    types: [
      'Consultant',
      'Contractor',
      'External',
      'Internal',
      'Other',
      'Vendor'
    ],
    platform_access: [
      'Admin',
      'None',
      'Operational',
      'View Only'
    ],
    method_types: [
      'Email',
      'Phone',
      'SMS',
      'WhatsApp'
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
  // Loaded from: GET /api/dropdowns (flattened as building_types)
  // Note: Building status is now handled by is_active boolean field (consistent with Customer)
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
      'Decommissioned',
      'Maintenance Required',
      'Operational',
      'Out of Service',
      'Under Testing'
    ],
    criticality_levels: [
      'Critical',
      'High',
      'Low',
      'Medium'
    ],
    conditions: [
      'Average',
      'Excellent',
      'Fair',
      'Good',
      'New',
      'Other',
      'Poor'
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
      'BAK',
      'BIM',
      'CAD',
      'DWG',
      'Excel',
      'Image',
      'Other',
      'PDF',
      'Word'
    ],
    categories: [
      'Asset Registers',
      'Building Management & Control Diagrams',
      'Certification Reports',
      'Commissioning Data (Air & Water Balance Reports)',
      'Compliance Documents',
      'Construction Drawings',
      'Device Register',
      'Drawing Schedules',
      'Egress Report',
      'Electrical Schematics',
      'Fire Safety Reports',
      'HVAC Drawings',
      'Mechanical Services Drawings',
      'NABERS & Energy Reporting',
      'Operations & Maintenance (O&M) Manuals',
      'Plumbing & Hydraulics Drawings',
      'Project Management Documentation',
      'Service Reports',
      'Shop Drawings',
      'Tender Drawings & Specifications',
      'Warranty Certificates',
      'Waste Services'
    ],
    statuses: [
      'Approved',
      'Archived',
      'Draft',
      'Rejected',
      'Under Review'
    ],
    engineering_disciplines: [
      'Civil',
      'Electrical',
      'Fire Protection',
      'HVAC',
      'Mechanical',
      'Plumbing',
      'Structural',
      'Telecommunications'
    ],
    approval_statuses: [
      'Approved',
      'Pending',
      'Rejected',
      'Under Review'
    ]
  },

  // Vendor module dropdowns
  // Loaded from: GET /api/dropdowns (flattened as vendor_contractor_types, vendor_consultant_specialisations, etc.)
  vendor: {
    contractor_types: [
      'Building Consultant',
      'Cleaning Contractor',
      'Construction Contractor',
      'Electrical Contractor',
      'Fire Safety Contractor',
      'General Contractor',
      'HVAC Contractor',
      'Landscaping Contractor',
      'Maintenance Contractor',
      'Pest Control Contractor',
      'Plumbing Contractor',
      'Security Contractor'
    ],
    consultant_specialisations: [
      'Building Consultant',
      'Electrical Consultant',
      'Energy Consultant',
      'Engineering Consultant',
      'Environmental Consultant',
      'Fire Safety Consultant',
      'Mechanical Consultant',
      'Structural Consultant'
    ],
    certification_authorities: [
      'Accredited',
      'Council-appointed',
      'Private'
    ],
    services_provided: [
      'Compliance & Certification',
      'Consultation',
      'Design',
      'Emergency Callout',
      'Energy Audits',
      'Inspections',
      'Installation',
      'Maintenance & Repairs',
      'Project Management',
      'Testing & Commissioning'
    ],
    business_types: [
      'company',
      'other',
      'partnership',
      'sole-trader',
      'trust'
    ],
    insurance_types: [
      'cyber-liability',
      'directors-officers',
      'product-liability',
      'professional-indemnity',
      'public-liability',
      'workers-compensation'
    ],
    license_types: [
      'asbestos-removal',
      'builders',
      'crane-operator',
      'demolition',
      'electrical',
      'fire-safety',
      'gas-fitting',
      'other',
      'plumbing',
      'refrigeration',
      'scaffolding'
    ],
    status_types: [
      'current',
      'expired',
      'expiring-soon',
      'not-required',
      'pending'
    ],
    statuses: [
      'active',
      'inactive',
      'pending-approval',
      'suspended',
      'under-review'
    ]
  }
};

module.exports = DROPDOWN_CONSTANTS;
