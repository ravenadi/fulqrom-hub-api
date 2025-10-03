// Customer Constants for Dropdown Values
// Based on the Customer schema for Fulqrom Hub - Australian Commercial Real Estate & HVAC Building Management

const CUSTOMER_CONSTANTS = {
  // Australian States and Territories
  AUSTRALIAN_STATES: [
    { value: 'NSW', label: 'New South Wales' },
    { value: 'VIC', label: 'Victoria' },
    { value: 'QLD', label: 'Queensland' },
    { value: 'WA', label: 'Western Australia' },
    { value: 'SA', label: 'South Australia' },
    { value: 'TAS', label: 'Tasmania' },
    { value: 'ACT', label: 'Australian Capital Territory' },
    { value: 'NT', label: 'Northern Territory' }
  ],

  // Organisation Size Categories
  ORGANISATION_SIZES: [
    { value: '1-10', label: '1-10 employees' },
    { value: '11-50', label: '11-50 employees' },
    { value: '51-200', label: '51-200 employees' },
    { value: '201-500', label: '201-500 employees' },
    { value: '501-1000', label: '501-1000 employees' },
    { value: '1000+', label: '1000+ employees' }
  ],

  // Role Types for Customer Roles
  ROLE_TYPES: [
    { value: 'Primary', label: 'Primary Contact' },
    { value: 'Secondary', label: 'Secondary Contact' },
    { value: 'Other', label: 'Other' }
  ],

  // Contact Types
  CONTACT_TYPES: [
    { value: 'Internal', label: 'Internal Contact' },
    { value: 'External', label: 'External Contact' },
    { value: 'Other', label: 'Other' }
  ],

  // Platform Access Levels
  PLATFORM_ACCESS_LEVELS: [
    { value: 'Operational', label: 'Operational Access' },
    { value: 'View Only', label: 'View Only Access' },
    { value: 'Admin', label: 'Administrative Access' },
    { value: 'None', label: 'No Platform Access' }
  ],

  // Contact Types (for contacts array)
  CONTACT_METHOD_TYPES: [
    { value: 'Email', label: 'Email Contact' },
    { value: 'Phone', label: 'Phone Contact' },
    { value: 'Other', label: 'Other Contact Method' }
  ],

  // Customer Status Options
  STATUS_OPTIONS: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending Activation' }
  ],

  // Australian Industry Types (Common for Commercial Real Estate & HVAC)
  INDUSTRY_TYPES: [
    { value: 'commercial-real-estate', label: 'Commercial Real Estate' },
    { value: 'property-management', label: 'Property Management' },
    { value: 'facility-management', label: 'Facility Management' },
    { value: 'hvac-services', label: 'HVAC Services' },
    { value: 'building-maintenance', label: 'Building Maintenance' },
    { value: 'construction', label: 'Construction' },
    { value: 'engineering-services', label: 'Engineering Services' },
    { value: 'consulting', label: 'Professional Consulting' },
    { value: 'retail', label: 'Retail' },
    { value: 'office', label: 'Office/Corporate' },
    { value: 'industrial', label: 'Industrial' },
    { value: 'hospitality', label: 'Hospitality' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'education', label: 'Education' },
    { value: 'government', label: 'Government' },
    { value: 'other', label: 'Other' }
  ],

  // Common Australian Department Names
  DEPARTMENTS: [
    { value: 'property-management', label: 'Property Management' },
    { value: 'facility-management', label: 'Facility Management' },
    { value: 'operations', label: 'Operations' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'administration', label: 'Administration' },
    { value: 'finance', label: 'Finance' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'safety', label: 'Safety & WHS' },
    { value: 'executive', label: 'Executive' },
    { value: 'it', label: 'Information Technology' },
    { value: 'other', label: 'Other' }
  ],

  // Common Job Titles in Australian Commercial Real Estate
  JOB_TITLES: [
    { value: 'property-manager', label: 'Property Manager' },
    { value: 'facility-manager', label: 'Facility Manager' },
    { value: 'operations-manager', label: 'Operations Manager' },
    { value: 'general-manager', label: 'General Manager' },
    { value: 'ceo', label: 'Chief Executive Officer' },
    { value: 'director', label: 'Director' },
    { value: 'senior-property-manager', label: 'Senior Property Manager' },
    { value: 'asset-manager', label: 'Asset Manager' },
    { value: 'portfolio-manager', label: 'Portfolio Manager' },
    { value: 'maintenance-manager', label: 'Maintenance Manager' },
    { value: 'compliance-manager', label: 'Compliance Manager' },
    { value: 'accounts-manager', label: 'Accounts Manager' },
    { value: 'administrator', label: 'Administrator' },
    { value: 'coordinator', label: 'Coordinator' },
    { value: 'other', label: 'Other' }
  ],

  // Validation Patterns
  VALIDATION_PATTERNS: {
    ABN: /^\d{11}$/, // Australian Business Number - 11 digits
    ACN: /^\d{9}$/, // Australian Company Number - 9 digits
    POSTCODE: /^\d{4}$/, // Australian 4-digit postcodes
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },

  // Common Australian Postcodes by State (major cities)
  MAJOR_POSTCODES: {
    NSW: ['2000', '2001', '2010', '2020', '2030', '2040', '2050'],
    VIC: ['3000', '3001', '3010', '3020', '3030', '3040', '3050'],
    QLD: ['4000', '4001', '4010', '4020', '4030', '4040', '4050'],
    WA: ['6000', '6001', '6010', '6020', '6030', '6040', '6050'],
    SA: ['5000', '5001', '5010', '5020', '5030', '5040', '5050'],
    TAS: ['7000', '7001', '7010', '7020', '7030', '7040', '7050'],
    ACT: ['2600', '2601', '2610', '2620', '2630', '2640', '2650'],
    NT: ['0800', '0801', '0810', '0820', '0830', '0840', '0850']
  }
};

module.exports = CUSTOMER_CONSTANTS;