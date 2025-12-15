/**
 * Application Constants and Configuration
 * Centralizes hardcoded values that were scattered across the codebase.
 *
 * @module config/constants
 */

module.exports = {
  // Session Configuration
  session: {
    TTL: parseInt(process.env.SESSION_TTL) || 86400, // 24 hours in seconds
    SINGLE_SESSION: process.env.SINGLE_SESSION === 'true' || true,
    COOKIE_MAX_AGE: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours in ms
  },

  // File Upload Limits
  upload: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 * 1024, // 10GB
    MAX_DOCUMENT_SIZE: parseInt(process.env.MAX_DOCUMENT_SIZE) || 50 * 1024 * 1024, // 50MB
    MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE) || 10 * 1024 * 1024, // 10MB
    ALLOWED_DOCUMENT_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]
  },

  // Pagination Defaults
  pagination: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1
  },

  // Rate Limiting (requests per window)
  rateLimits: {
    GENERAL_API: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_GENERAL) || 100
    },
    AUTHENTICATION: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_AUTH) || 5
    },
    FILE_UPLOAD: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: parseInt(process.env.RATE_LIMIT_UPLOAD) || 50
    },
    PUBLIC: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_PUBLIC) || 30
    },
    CRITICAL: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: parseInt(process.env.RATE_LIMIT_CRITICAL) || 3
    }
  },

  // Cache Durations (in seconds)
  cache: {
    DROPDOWN: 5 * 60, // 5 minutes
    STATS: 60, // 1 minute
    PRESIGNED_URL: 60 * 60 // 1 hour
  },

  // Entity Validation
  validation: {
    ABN_LENGTH: 11,
    ACN_LENGTH: 9,
    AU_POSTCODE_LENGTH: 4,
    PHONE_MIN_LENGTH: 8,
    PHONE_MAX_LENGTH: 15
  },

  // Floor Types
  floorTypes: [
    'Office',
    'Retail',
    'Common Area',
    'Parking',
    'Storage',
    'Plant Room',
    'Basement',
    'Ground',
    'Rooftop'
  ],

  // Floor Occupancy Types
  occupancyTypes: [
    'Single Tenant',
    'Multi Tenant',
    'Common Area'
  ],

  // Access Control Levels
  accessControlLevels: [
    'Public',
    'Keycard Required',
    'Restricted'
  ],

  // Special Features
  specialFeatures: [
    'Equipment Room',
    'Common Area',
    'Server Room',
    'Meeting Room',
    'Kitchen',
    'Storage'
  ],

  // Status Options
  statusOptions: {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    UNDER_CONSTRUCTION: 'Under Construction',
    PENDING: 'Pending'
  }
};
