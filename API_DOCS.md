# API Documentation - Fulqrom Hub REST API

## Base URL
```
Production: https://api.yourdomain.com
Development: http://localhost:30001
```

## Authentication
Currently, the API does not implement authentication. This should be added before production deployment.

**Recommended:** Implement JWT-based authentication for all endpoints except `/health`.

---

## Table of Contents
- [Health Check](#health-check)
- [Customers](#customers)
- [Contacts](#contacts)
- [Sites](#sites)
- [Buildings](#buildings)
- [Floors](#floors)
- [Assets](#assets)
- [Documents](#documents)
- [Vendors](#vendors)
- [Users](#users)
- [Roles](#roles)
- [Dropdowns](#dropdowns)
- [Hierarchy](#hierarchy)

---

## Health Check

### GET /health
Check API health status

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-10-10T10:50:00.000Z",
  "service": "Fulqrom Hub API",
  "version": "1.0.0"
}
```

---

## Customers

### GET /api/customers
Get all customers with pagination and search

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `search` (string): Search by name, email, ABN, or ACN
- `sort` (string): Sort field (default: createdAt)
- `order` (string): Sort order: asc | desc (default: desc)

**Example:**
```bash
GET /api/customers?page=1&limit=10&search=qbe&sort=name&order=asc
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 45,
  "page": 1,
  "pages": 5,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "QBE Insurance",
      "abn": "12345678901",
      "email": "contact@qbe.com.au",
      "phone": "+61 2 9000 0000",
      "is_active": true,
      "createdAt": "2025-01-15T00:00:00.000Z"
    }
  ]
}
```

### GET /api/customers/:id
Get customer by ID

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "QBE Insurance",
    "abn": "12345678901",
    "acn": "123456789",
    "email": "contact@qbe.com.au",
    "phone": "+61 2 9000 0000",
    "address": {
      "street": "388 George Street",
      "suburb": "Sydney",
      "state": "NSW",
      "postcode": "2000",
      "country": "Australia"
    },
    "is_active": true
  }
}
```

### POST /api/customers
Create new customer

**Request Body:**
```json
{
  "name": "New Company Pty Ltd",
  "abn": "12345678901",
  "acn": "123456789",
  "email": "contact@newcompany.com.au",
  "phone": "+61 2 9000 0000",
  "address": {
    "street": "123 Example St",
    "suburb": "Melbourne",
    "state": "VIC",
    "postcode": "3000",
    "country": "Australia"
  }
}
```

**Validation:**
- `name`: Required, string
- `abn`: Optional, 11 digits
- `acn`: Optional, 9 digits
- `email`: Optional, valid email
- `postcode`: 4 digits (Australian format)

### PUT /api/customers/:id
Update customer

**Request Body:** Same as POST (all fields optional)

### DELETE /api/customers/:id
Delete customer

---

## Sites

### GET /api/sites
Get all sites with filtering

**Query Parameters:**
- `customer_id` (string): Filter by customer
- `page`, `limit`, `search`, `sort`, `order`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "QBE House",
      "customer_id": "507f1f77bcf86cd799439011",
      "address": {
        "street": "388 George Street",
        "suburb": "Sydney",
        "state": "NSW",
        "postcode": "2000"
      },
      "is_active": true
    }
  ]
}
```

### POST /api/sites
Create new site

**Request Body:**
```json
{
  "name": "QBE House",
  "customer_id": "507f1f77bcf86cd799439011",
  "address": {
    "street": "388 George Street",
    "suburb": "Sydney",
    "state": "NSW",
    "postcode": "2000",
    "country": "Australia"
  },
  "site_type": "Commercial",
  "total_area": 15000,
  "year_built": 1975
}
```

---

## Buildings

### GET /api/buildings
Get all buildings

**Query Parameters:**
- `site_id` (string): Filter by site
- `customer_id` (string): Filter by customer

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Tower A",
      "site_id": "507f1f77bcf86cd799439012",
      "customer_id": "507f1f77bcf86cd799439011",
      "building_type": "Office",
      "total_floors": 25,
      "total_area": 12000,
      "is_active": true
    }
  ]
}
```

### POST /api/buildings
Create new building

**Request Body:**
```json
{
  "name": "Tower A",
  "site_id": "507f1f77bcf86cd799439012",
  "customer_id": "507f1f77bcf86cd799439011",
  "building_type": "Office",
  "total_floors": 25,
  "total_area": 12000,
  "year_built": 1975,
  "address": {
    "street": "388 George Street",
    "suburb": "Sydney",
    "state": "NSW",
    "postcode": "2000"
  }
}
```

---

## Assets

### GET /api/assets
Get all assets with advanced filtering

**Query Parameters:**
- `customer_id`, `site_id`, `building_id`, `floor_id`
- `asset_type`: HVAC | Electrical | Fire Safety | Other
- `asset_category`: AC | Chiller | Boiler | etc.
- `criticality_level`: Critical | High | Medium | Low
- `status`: Operational | Under Maintenance | Decommissioned
- `page`, `limit`, `search`, `sort`, `order`

**Response:**
```json
{
  "success": true,
  "count": 15,
  "total": 150,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "asset_tag": "HVAC-001",
      "asset_name": "Chiller Unit 1",
      "asset_type": "HVAC",
      "asset_category": "Chiller",
      "manufacturer": "Carrier",
      "model_number": "30XA-502",
      "serial_number": "SN123456",
      "criticality_level": "Critical",
      "status": "Operational",
      "location": {
        "customer_id": "507f1f77bcf86cd799439011",
        "site_id": "507f1f77bcf86cd799439012",
        "building_id": "507f1f77bcf86cd799439013",
        "floor_id": "507f1f77bcf86cd799439015"
      }
    }
  ]
}
```

### POST /api/assets
Create new asset

**Request Body:**
```json
{
  "asset_tag": "HVAC-001",
  "asset_name": "Chiller Unit 1",
  "asset_type": "HVAC",
  "asset_category": "Chiller",
  "manufacturer": "Carrier",
  "model_number": "30XA-502",
  "serial_number": "SN123456",
  "criticality_level": "Critical",
  "status": "Operational",
  "location": {
    "customer_id": "507f1f77bcf86cd799439011",
    "site_id": "507f1f77bcf86cd799439012",
    "building_id": "507f1f77bcf86cd799439013",
    "floor_id": "507f1f77bcf86cd799439015"
  },
  "installation_date": "2020-06-15",
  "warranty_expiry_date": "2025-06-15"
}
```

---

## Documents

### GET /api/documents
Get all documents with advanced filtering

**Query Parameters:**
- `customer_id`, `site_id`, `building_id`, `floor_id`, `asset_id`
- `category`: Manual | Certificate | Report | Drawing | Other
- `type`: User Manual | Service Manual | Installation Manual | etc.
- `status`: Draft | Final | Archived
- `approval_status`: Pending | Approved | Rejected
- `page`, `limit`, `search`, `sort`, `order`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "name": "Chiller Maintenance Manual",
      "category": "Manual",
      "type": "Service Manual",
      "status": "Final",
      "approval_status": "Approved",
      "file": {
        "file_meta": {
          "file_name": "chiller-manual.pdf",
          "file_size": 2048576,
          "file_type": "application/pdf",
          "file_key": "documents/xyz123.pdf"
        }
      },
      "location": {
        "asset": {
          "asset_id": "507f1f77bcf86cd799439014",
          "asset_name": "Chiller Unit 1"
        }
      },
      "version_number": 1,
      "uploaded_by": "john@example.com",
      "uploaded_date": "2025-01-15T00:00:00.000Z"
    }
  ]
}
```

### POST /api/documents
Upload new document (multipart/form-data)

**Form Data:**
- `file` (file): PDF, DOC, DOCX, XLS, XLSX, PNG, JPG (max 10MB)
- `name` (string): Document name
- `category` (string): Document category
- `type` (string): Document type
- `status` (string): Document status
- `description` (string): Optional description
- `location` (JSON): Location information

**Example using cURL:**
```bash
curl -X POST http://localhost:30001/api/documents \
  -F "file=@/path/to/document.pdf" \
  -F "name=Chiller Manual" \
  -F "category=Manual" \
  -F "type=Service Manual" \
  -F "status=Final" \
  -F 'location={"asset":{"asset_id":"507f1f77bcf86cd799439014"}}'
```

### GET /api/documents/:id/download
Get presigned download URL for document

**Response:**
```json
{
  "success": true,
  "download_url": "https://s3.amazonaws.com/...",
  "file_name": "chiller-manual.pdf",
  "file_size": 2048576,
  "expires_in": 3600
}
```

### POST /api/documents/:id/versions
Upload new version of document

### POST /api/documents/:id/review
Submit document review/comment

**Request Body:**
```json
{
  "comment": "Reviewed and approved",
  "new_status": "Approved",
  "reviewer_name": "John Smith",
  "reviewer_email": "john@example.com"
}
```

---

## Vendors

### GET /api/vendors
Get all vendors

**Query Parameters:**
- `contractor_type`: HVAC Contractor | Electrical Contractor | etc.
- `status`: active | inactive
- `preferred_provider`: true | false
- `page`, `limit`, `search`, `sort`, `order`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439017",
      "contractor_name": "ABC HVAC Services",
      "trading_name": "ABC Services",
      "abn": "12345678901",
      "contractor_type": "HVAC Contractor",
      "email": "contact@abchvac.com.au",
      "phone": "+61 2 9000 0000",
      "address": {
        "street": "123 Service Rd",
        "suburb": "Sydney",
        "state": "NSW",
        "postcode": "2000"
      },
      "preferred_provider": true,
      "status": "active",
      "rating": 4.5,
      "services_provided": ["Installation", "Maintenance", "Repair"]
    }
  ]
}
```

### POST /api/vendors
Create new vendor

**Request Body:**
```json
{
  "contractor_name": "ABC HVAC Services",
  "abn": "12345678901",
  "contractor_type": "HVAC Contractor",
  "email": "contact@abchvac.com.au",
  "phone": "+61 2 9000 0000",
  "address": {
    "street": "123 Service Rd",
    "suburb": "Sydney",
    "state": "NSW",
    "postcode": "2000"
  },
  "businessType": "Pty Ltd",
  "services_provided": ["Installation", "Maintenance"]
}
```

---

## Users

### GET /api/users
Get all users

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439018",
      "email": "john@example.com",
      "full_name": "John Smith",
      "phone": "+61 400 000 000",
      "role_ids": ["507f1f77bcf86cd799439019"],
      "is_active": true,
      "created_at": "2025-01-15T00:00:00.000Z"
    }
  ]
}
```

### POST /api/users
Create new user

**Request Body:**
```json
{
  "email": "john@example.com",
  "full_name": "John Smith",
  "phone": "+61 400 000 000",
  "role_ids": ["507f1f77bcf86cd799439019"],
  "is_active": true
}
```

---

## Roles

### GET /api/roles
Get all roles

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439019",
      "name": "Site Manager",
      "description": "Full site management access",
      "permissions": [
        {
          "module_name": "customers",
          "can_view": true,
          "can_create": true,
          "can_edit": true,
          "can_delete": true
        }
      ],
      "is_active": true
    }
  ]
}
```

### POST /api/roles
Create new role

**Request Body:**
```json
{
  "name": "Site Manager",
  "description": "Full site management access",
  "permissions": [
    {
      "module_name": "customers",
      "can_view": true,
      "can_create": true,
      "can_edit": true,
      "can_delete": true
    }
  ]
}
```

---

## Dropdowns

### GET /api/dropdowns
Get all dropdown values for the application

**Response:**
```json
{
  "success": true,
  "data": {
    "australian_states": ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"],
    "asset_types": ["HVAC", "Electrical", "Fire Safety", "Plumbing"],
    "asset_categories": ["AC", "Chiller", "Boiler", "AHU"],
    "criticality_levels": ["Critical", "High", "Medium", "Low"],
    "document_categories": ["Manual", "Certificate", "Report", "Drawing"],
    "vendor_contractor_types": ["HVAC Contractor", "Electrical Contractor"]
  }
}
```

### PUT /api/dropdowns
Update dropdown values (Admin only)

---

## Hierarchy

### GET /api/hierarchy/customer/:customerId
Get complete hierarchy for a customer

**Response:**
```json
{
  "success": true,
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "QBE Insurance"
    },
    "sites": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "QBE House",
        "buildings": [
          {
            "_id": "507f1f77bcf86cd799439013",
            "name": "Tower A",
            "floors": [
              {
                "_id": "507f1f77bcf86cd799439015",
                "name": "Level 1",
                "asset_count": 15
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Australian Standards

### ABN Validation
- Format: 11 digits
- Example: `12 345 678 901`

### ACN Validation
- Format: 9 digits
- Example: `123 456 789`

### Postcode Validation
- Format: 4 digits
- Example: `2000`

### Date Format
- Format: DD/MM/YYYY
- Example: `15/01/2025`

### Currency
- Format: AUD with space thousands separator
- Example: `$42 850`

---

## Rate Limiting
Currently not implemented. Recommended to add rate limiting before production:
- 100 requests per minute per IP
- 1000 requests per hour per IP

---

## Webhooks
Not implemented in v1.0.0. Future enhancement.

---

## Support

For API issues or questions:
- Review [README.md](README.md)
- Check [DEPLOYMENT.md](DEPLOYMENT.md)
- Review [KNOWN_ISSUES.md](KNOWN_ISSUES.md)

---

**Version:** 1.0.0
**Last Updated:** October 2025
**Developed by Ravenlabs Team**
