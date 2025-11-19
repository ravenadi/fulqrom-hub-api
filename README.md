# Fulqrom Hub REST API

A comprehensive REST API for managing Australian commercial real estate properties, buildings, assets (HVAC, electrical, fire safety equipment), and maintenance workflows.

## Overview

Fulqrom Hub is a commercial real estate and HVAC&R building management platform built for the Australian market. This REST API provides endpoints for managing customers, sites, buildings, floors, assets, documents, vendors, and maintenance operations with full support for Australian business standards.

## Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **File Storage**: AWS S3
- **Validation**: Joi
- **Security**: Helmet, CORS
- **Email**: Nodemailer

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- MongoDB Atlas account or local MongoDB instance
- AWS S3 bucket for file storage

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the root directory with the following variables:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_CONNECTION=your_mongodb_connection_string

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=your_s3_bucket_name

# Email Configuration (Optional)
EMAIL_HOST=your_smtp_host
EMAIL_PORT=587
EMAIL_USER=your_email_user
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@fulqrom.com
```

Refer to `.env.example` for a complete list of configuration options.

### Running the Application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /health` - API health status

### Customers
- `GET /api/customers` - List all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create new customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Sites
- `GET /api/sites` - List all sites
- `GET /api/sites/:id` - Get site by ID
- `POST /api/sites` - Create new site
- `PUT /api/sites/:id` - Update site
- `DELETE /api/sites/:id` - Delete site

### Buildings
- `GET /api/buildings` - List all buildings
- `GET /api/buildings/:id` - Get building by ID
- `POST /api/buildings` - Create new building
- `PUT /api/buildings/:id` - Update building
- `DELETE /api/buildings/:id` - Delete building

### Floors
- `GET /api/floors` - List all floors
- `GET /api/floors/:id` - Get floor by ID
- `POST /api/floors` - Create new floor
- `PUT /api/floors/:id` - Update floor
- `DELETE /api/floors/:id` - Delete floor

### Assets
- `GET /api/assets` - List all assets
- `GET /api/assets/:id` - Get asset by ID
- `POST /api/assets` - Create new asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset
- `GET /api/assets/:id/documents` - Get asset documents

### Documents
- `GET /api/documents` - List all documents
- `GET /api/documents/:id` - Get document by ID
- `POST /api/documents` - Upload new document
- `PUT /api/documents/:id` - Update document metadata
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/:id/review` - Submit document review

### Vendors
- `GET /api/vendors` - List all vendors
- `GET /api/vendors/:id` - Get vendor by ID
- `POST /api/vendors` - Create new vendor
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor

### Users & Authentication
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Roles & Permissions
- `GET /api/roles` - List all roles
- `GET /api/roles/:id` - Get role by ID
- `POST /api/roles` - Create new role
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role

### Dropdowns & Reference Data
- `GET /api/dropdowns/:type` - Get dropdown options by type

### Hierarchy
- `GET /api/hierarchy/customer/:customerId` - Get complete hierarchy for customer

## Australian Standards Compliance

The API enforces Australian business standards:

- **ABN**: 11-digit Australian Business Number validation
- **ACN**: 9-digit Australian Company Number validation
- **Postcodes**: 4-digit postcode validation
- **Currency**: AUD formatting ($42 850)
- **Dates**: DD/MM/YYYY format
- **Units**: SI units with spaces (e.g., 42 850 m²)
- **Language**: Australian English spelling

## Data Models

### Key Entities

- **Customers**: Commercial real estate clients
- **Sites**: Property locations
- **Buildings**: Structures within sites
- **Floors**: Levels within buildings
- **Assets**: HVAC, electrical, and fire safety equipment
- **Documents**: Files, manuals, certificates
- **Vendors**: Service providers and contractors
- **Users**: System users with role-based access
- **Contacts**: Client contacts

## File Upload

The API supports file uploads for documents with the following features:

- AWS S3 integration for storage
- Presigned URLs for secure downloads
- Document versioning
- Multiple file types support (PDF, images, Office documents)
- File size limits configurable via environment variables

## Architecture

### Same-Origin Deployment with `/api` Prefix
The API uses the `/api` prefix for architectural reasons:
- **Same domain**: Frontend and API share `hub.fulqrom.com` (no separate subdomain)
- **Cookie-based auth**: HttpOnly session cookies require same origin
- **Route namespace**: Prevents conflicts between frontend routes and API endpoints
- **No CORS**: Same-origin requests avoid CORS complexity
- **Vite proxy**: Dev proxy forwards `/api/*` to backend (see `vite.config.ts`)

### Dual Endpoint Pattern
The API provides two types of endpoints for resources:

**1. CRUD Endpoints** (Data Management)
- Example: `GET /api/sites?page=1&limit=10`
- Returns: Full objects (50+ fields), paginated
- Use: Data tables, entity management

**2. Dropdown Endpoints** (UI Components)
- Example: `GET /api/dropdowns/entities/sites?customer_id=123`
- Returns: Minimal hierarchical data `{id, label, value, parent_id}`
- Use: Cascading dropdowns, autocomplete
- Performance: 95% smaller payload

These are **not duplicates** - they serve different access patterns.

## Validation

The API implements comprehensive validation:

- **Request Validation**: Joi schemas for all inputs
- **Business Rules**: Australian standards compliance
- **Data Integrity**: Referential integrity checks
- **Security**: Input sanitization and SQL injection prevention
- **Error Responses**: Clear, actionable error messages

## Error Handling

Standard error response format:

```json
{
  "error": "Error message",
  "details": {
    "field": "Specific field error"
  }
}
```

HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

## Project Structure

```
rest-api/
├── server.js           # Application entry point
├── models/             # Mongoose data models
├── routes/             # API route handlers
├── middleware/         # Custom middleware
├── utils/              # Utility functions
├── constants/          # Application constants
├── scripts/            # Database scripts
├── migrations/         # Database migrations
├── data/               # Seed data
└── deploy/             # Deployment configurations
```

## Development

### Code Style

- Use Australian English spelling (colour, centre, realise)
- Follow standard JavaScript conventions
- Validate all inputs with Joi schemas
- Handle errors consistently

### Database Scripts

```bash
# Run migrations
node migrations/<migration-file>.js

# Seed data
node seeds/<seed-file>.js
```

## Deployment

The API can be deployed to various platforms:

- **AWS**: Elastic Beanstalk, EC2, ECS
- **Azure**: App Service
- **Google Cloud**: App Engine, Cloud Run
- **Heroku**: Web dyno

Deployment scripts and configurations are available in the `deploy/` directory.

## Support

For issues and feature requests, please contact the development team.

## Contributing

Please read [CHANGELOG.md](CHANGELOG.md) for details on version history and changes.

## License

MIT - See [LICENSE](LICENSE) file for details.

---

**Version**: 1.0.0
**Last Updated**: October 2025

---

<div align="center">
  <strong>Developed by Ravenlabs Team</strong>
  <br>
  <em>Building innovative solutions for commercial real estate management</em>
</div>
