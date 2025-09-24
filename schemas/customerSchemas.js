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

// Address schema (reusable)
const addressSchema = Joi.object({
  street: Joi.string().trim().max(100).required(),
  suburb: Joi.string().trim().max(50).required(),
  state: Joi.string().valid(...AUSTRALIAN_STATES).required(),
  postcode: Joi.string().pattern(/^\d{4}$/).required()
});

// Organisation schema
const organisationSchema = Joi.object({
  organisation_name: Joi.string().trim().max(200).required(),
  email_domain: Joi.string().trim().allow(''),
  logo_url: Joi.string().uri().allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  metadata: Joi.object().default({})
});

// Company Profile schema
const companyProfileSchema = Joi.object({
  business_number: Joi.string().trim().allow(''),
  company_number: Joi.string().trim().allow(''),
  trading_name: Joi.string().trim().allow(''),
  industry_type: Joi.string().valid(...INDUSTRY_TYPES).allow(''),
  organisation_size: Joi.string().valid(...ORG_SIZES).allow('')
});

// Contact Method schema
const contactMethodSchema = Joi.object({
  full_name: Joi.string().trim().max(100).required(),
  job_title: Joi.string().trim().allow(''),
  department: Joi.string().trim().allow(''),
  role_type: Joi.string().valid(...ROLE_TYPES).allow(''),
  contact_type: Joi.string().valid(...CONTACT_TYPES).allow(''),
  platform_access: Joi.string().valid(...PLATFORM_ACCESS).allow(''),
  method_type: Joi.string().valid(...METHOD_TYPES).required(),
  method_value: Joi.string().trim().required(),
  label: Joi.string().trim().allow(''),
  is_primary: Joi.boolean().default(false)
});

// Metadata Item schema
const metadataItemSchema = Joi.object({
  key: Joi.string().trim().required(),
  value: Joi.string().trim().required()
});

// Create Customer Schema
const createCustomerSchema = Joi.object({
  // Organisation Information
  organisation: organisationSchema.required(),

  // Company Profile Information
  company_profile: companyProfileSchema,

  // Address Information
  business_address: addressSchema,
  postal_address: addressSchema,

  // Contact Information
  contact_methods: Joi.array().items(contactMethodSchema).default([]),

  // Additional Information
  metadata: Joi.array().items(metadataItemSchema).default([]),

  // System fields
  is_active: Joi.boolean().default(true)
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