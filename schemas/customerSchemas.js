const Joi = require('joi');

// Australian states enum
const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

// Organisation size options
const ORG_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

// Industry types
const INDUSTRY_TYPES = ['Technology', 'Healthcare', 'Government', 'Retail', 'Hospitality', 'Industrial', 'Service', 'Finance', 'Education'];

// Role types
const ROLE_TYPES = ['Primary', 'Billing', 'Technical', 'General', 'Emergency', 'Project'];
const CONTACT_TYPES = ['Internal', 'External', 'Supplier', 'Customer', 'Contractor', 'Consultant', 'Emergency', 'Billing', 'Technical'];
const PLATFORM_ACCESS = ['Administrative', 'Operational', 'View Only', 'No Access'];
const METHOD_TYPES = ['Email', 'Phone', 'SMS', 'WhatsApp'];

// Address schema (reusable) - all fields optional
const addressSchema = Joi.object({
  street: Joi.string().trim().max(100).allow(''),
  suburb: Joi.string().trim().max(50).allow(''),
  state: Joi.string().valid(...AUSTRALIAN_STATES).allow(''),
  postcode: Joi.string().pattern(/^\d{4}$/).allow('')
});

// Organisation schema
const organisationSchema = Joi.object({
  organisation_name: Joi.string().trim().max(200).required(),
  email_domain: Joi.string().trim().allow(''),
  logo_url: Joi.string().uri().allow(''),
  building_image: Joi.string().uri().allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  metadata: Joi.object().default({})
});

// Company Profile schema - allow null for enum fields
const companyProfileSchema = Joi.object({
  business_number: Joi.string().trim().allow(''),
  company_number: Joi.string().trim().allow(''),
  trading_name: Joi.string().trim().allow(''),
  industry_type: Joi.string().valid(...INDUSTRY_TYPES).allow('', null),
  organisation_size: Joi.string().valid(...ORG_SIZES).allow('', null)
});

// Contact Method schema - allow null for enum fields
const contactMethodSchema = Joi.object({
  full_name: Joi.string().trim().max(100).allow(''),
  job_title: Joi.string().trim().allow(''),
  department: Joi.string().trim().allow(''),
  role_type: Joi.string().valid(...ROLE_TYPES).allow('', null),
  contact_type: Joi.string().valid(...CONTACT_TYPES).allow('', null),
  platform_access: Joi.string().valid(...PLATFORM_ACCESS).allow('', null),
  method_type: Joi.string().valid(...METHOD_TYPES).allow(''),
  method_value: Joi.string().trim().allow(''),
  label: Joi.string().trim().allow(''),
  is_primary: Joi.boolean().default(false)
});

// Metadata Item schema
const metadataItemSchema = Joi.object({
  key: Joi.string().trim().required(),
  value: Joi.string().trim().required()
});

// Create Customer Schema - only organisation name required
const createCustomerSchema = Joi.object({
  // Organisation Information
  organisation: organisationSchema.required(),

  // Company Profile Information (optional)
  company_profile: companyProfileSchema.optional(),

  // Address Information (optional)
  business_address: addressSchema.optional(),
  postal_address: addressSchema.optional(),

  // Contact Information (optional)
  contact_methods: Joi.array().items(contactMethodSchema).optional().default([]),

  // Additional Information (optional)
  metadata: Joi.array().items(metadataItemSchema).optional().default([]),

  // System fields
  is_active: Joi.boolean().optional().default(true)
});

// Update Customer Schema (all fields optional)
const updateCustomerSchema = Joi.object({
  organisation: organisationSchema,
  company_profile: companyProfileSchema,
  business_address: addressSchema,
  postal_address: addressSchema,
  contact_methods: Joi.array().items(contactMethodSchema),
  metadata: Joi.array().items(metadataItemSchema),
  is_active: Joi.boolean()
});

// Query parameters schema
const queryParamsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  is_active: Joi.boolean(),
  state: Joi.string().valid(...AUSTRALIAN_STATES),
  search: Joi.string().trim().max(200),
  sortBy: Joi.string().valid('organisation.organisation_name', 'createdAt', 'updatedAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// MongoDB ObjectId validation
const objectIdSchema = Joi.object({
  id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.pattern.base': 'Invalid customer ID format - must be a valid MongoDB ObjectId'
    })
});

// Response schemas for documentation
const customerResponseSchema = {
  success: true,
  data: {
    _id: 'ObjectId',
    organisation: {
      organisation_name: 'string',
      email_domain: 'string',
      logo_url: 'string',
      building_image: 'string',
      notes: 'string',
      metadata: 'object'
    },
    company_profile: {
      business_number: 'string',
      company_number: 'string',
      trading_name: 'string',
      industry_type: 'string',
      organisation_size: 'string'
    },
    business_address: {
      street: 'string',
      suburb: 'string',
      state: 'string',
      postcode: 'string (4 digits)'
    },
    postal_address: {
      street: 'string',
      suburb: 'string',
      state: 'string',
      postcode: 'string (4 digits)'
    },
    contact_methods: [
      {
        full_name: 'string',
        job_title: 'string',
        department: 'string',
        role_type: 'string',
        contact_type: 'string',
        platform_access: 'string',
        method_type: 'string',
        method_value: 'string',
        label: 'string',
        is_primary: 'boolean'
      }
    ],
    metadata: [
      {
        key: 'string',
        value: 'string'
      }
    ],
    is_active: 'boolean',
    createdAt: 'DateTime',
    updatedAt: 'DateTime',
    full_business_address: 'string (virtual)',
    full_postal_address: 'string (virtual)',
    primary_contact: 'object (virtual)',
    display_name: 'string (virtual)',
    abn_display: 'string (virtual)'
  }
};

const customersListResponseSchema = {
  success: true,
  count: 'number',
  totalCount: 'number',
  totalPages: 'number',
  currentPage: 'number',
  hasNextPage: 'boolean',
  hasPrevPage: 'boolean',
  data: [customerResponseSchema.data]
};

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
  queryParamsSchema,
  objectIdSchema,
  customerResponseSchema,
  customersListResponseSchema,
  // Export constants for reuse
  AUSTRALIAN_STATES,
  ORG_SIZES,
  INDUSTRY_TYPES,
  ROLE_TYPES,
  CONTACT_TYPES,
  PLATFORM_ACCESS,
  METHOD_TYPES
};