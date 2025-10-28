# Changelog

All notable changes to the Fulqrom Hub REST API project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2024-12-20

### Fixed
- Vendor API: Removed required validation for `address` and `businessType` fields to align with frontend form
  - Address is now optional (can be added later if needed)
  - Business type requirement removed (using contractor_type instead)

### Changed
- Vendor DELETE endpoint: Changed from soft delete to hard delete (completely removes vendor from database)
- Vendor API endpoints: Updated to match buildings API pattern for consistency
  - All endpoints now return 403 for tenant context issues (instead of 400)
  - Error messages standardized to say "Tenant context required to..."
  - DELETE endpoint returns only success message (no data object)
  - Consistent commenting and code structure across all endpoints
  - Added `meta` object to GET list response to match buildings API structure

### Updated
- Verified and updated API reference documentation (`api-reference.json`)
  - Corrected building-tenants path from `/tenants` to `/building-tenants` to match actual route configuration
  - Updated roles endpoints to reflect current implementation (removed v2 prefix, marked legacy routes as deprecated)
  - Added 15+ missing document management endpoints including:
    - Approval workflow endpoints (`request-approval`, `approve`, `reject`, `revoke-approval`)
    - Version management endpoints (`versions`, `versions/:documentGroupId`, `versions/:versionId/download`, `versions/:versionId/restore`)
    - Additional utility endpoints (`tags`, `stats`, `preview`, `storage/stats`, `options/entities`)
    - Bulk operations (`bulk-update`, `bulk` delete)
    - Comments and reviews (`comments`, `review`)
  - Updated last_updated date to 2024-12-20

## [1.0.0] - 2025-10-10

### Added
- Complete REST API for Australian commercial real estate and HVAC building management
- Customer management endpoints with Australian business standards (ABN/ACN validation)
- Site, building, floor, and asset hierarchy management
- Document management with AWS S3 integration and versioning
- Vendor management with licenses, insurance, and certification tracking
- User and role-based access control system
- Email notification system with multiple provider support
- Comprehensive dropdown/reference data management
- Australian compliance validation (postcodes, ABN, ACN)
- Search and filtering capabilities across all entities
- Document review and approval workflow
- Asset lifecycle management (HVAC, electrical, fire safety equipment)
- MongoDB database with Mongoose ODM
- Security middleware (Helmet, CORS)
- Error handling and validation with Joi schemas
- Health check endpoint for monitoring
- Database migration scripts
- Seed data for development

### Features
- **Customer Management**: Full CRUD operations with Australian business validation
- **Property Hierarchy**: Sites → Buildings → Floors → Assets
- **Asset Management**: Comprehensive tracking of HVAC, electrical, and fire safety equipment
- **Document Control**: Upload, versioning, review workflows with S3 storage
- **Vendor Portal**: Contractor management with compliance tracking
- **User Management**: Role-based permissions and access control
- **Email Integration**: SMTP support with multiple provider configurations
- **Australian Standards**: ABN (11 digits), ACN (9 digits), 4-digit postcodes
- **API Documentation**: Complete endpoint documentation in README
- **Environment Configuration**: Comprehensive .env.example for easy setup

### Technical Details
- Node.js >=18.0.0
- Express.js web framework
- MongoDB Atlas cloud database
- AWS S3 for file storage
- Joi for input validation
- Helmet for security headers
- Compression for response optimization
- Nodemailer for email delivery

### Deployment
- Production-ready configuration
- Environment-based settings
- Graceful shutdown handling
- Database connection pooling
- Error logging and monitoring support

---

**Developed by Ravenlabs Team**
