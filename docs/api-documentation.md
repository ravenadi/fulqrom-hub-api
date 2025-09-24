# Fulqrom Hub REST API Documentation

## Overview
Schema-driven REST API for Australian Commercial Real Estate & HVAC Building Management System.

## Base URL
```
http://localhost:3000
```

## Authentication
Currently no authentication required (MVP phase).

## Response Format
All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "message": "Optional success message",
  "data": {}, // Single resource or array
  "count": 10, // For array responses
  "totalCount": 100, // For paginated responses
  "currentPage": 1,
  "totalPages": 10,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "abn",
      "message": "ABN must be exactly 11 digits",
      "value": "123"
    }
  ],
  "details": {
    "errorType": "VALIDATION_ERROR",
    "source": "body"
  }
}
```

## Customers API

### GET /api/customers
List all customers with pagination, search, and filtering.

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 10 | Items per page (max 100) |
| `status` | string | - | Filter by status: active, inactive, pending |
| `state` | string | - | Filter by Australian state |
| `search` | string | - | Search in name, trading name, ABN, suburb |
| `sortBy` | string | createdAt | Sort field: organisationName, createdAt, updatedAt |
| `sortOrder` | string | desc | Sort order: asc, desc |

#### Example Request
```bash
curl -X GET "http://localhost:3000/api/customers?page=1&limit=5&status=active&search=corp&sortBy=organisationName&sortOrder=asc"
```

#### Example Response
```json
{
  "success": true,
  "count": 5,
  "totalCount": 25,
  "totalPages": 5,
  "currentPage": 1,
  "hasNextPage": true,
  "hasPrevPage": false,
  "data": [
    {
      "_id": "647abc123def456789012345",
      "organisationName": "Westfield Corporation",
      "abn": "12345678901",
      "acn": "123456789",
      "tradingName": "Westfield",
      "industryType": "Retail",
      "businessAddress": {
        "street": "123 Collins Street",
        "suburb": "Melbourne",
        "state": "VIC",
        "postcode": "3000"
      },
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET /api/customers/:id
Get a single customer by ID.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | ObjectId | MongoDB ObjectId of the customer |

#### Example Request
```bash
curl -X GET http://localhost:3000/api/customers/647abc123def456789012345
```

### POST /api/customers
Create a new customer.

#### Request Body Schema
```json
{
  "organisationName": "string (required, max 200)",
  "logoUrl": "string (optional, valid URI)",
  "abn": "string (required, exactly 11 digits)",
  "acn": "string (optional, exactly 9 digits)",
  "tradingName": "string (optional, max 200)",
  "industryType": "string (optional, max 100)",
  "organisationSize": "enum (optional): 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+",
  "businessAddress": {
    "street": "string (required, max 200)",
    "suburb": "string (required, max 100)",
    "state": "enum (required): NSW, VIC, QLD, WA, SA, TAS, ACT, NT",
    "postcode": "string (required, 4 digits)"
  },
  "postalAddress": {
    "street": "string (optional, max 200)",
    "suburb": "string (optional, max 100)",
    "state": "enum (optional): NSW, VIC, QLD, WA, SA, TAS, ACT, NT",
    "postcode": "string (optional, 4 digits)"
  },
  "organisationNotes": "string (optional, max 2000)",
  "role": {
    "title": "string (optional, max 100)",
    "department": "string (optional, max 100)",
    "roleType": "enum (optional): Primary, Secondary, Other",
    "contactType": "enum (optional): Internal, External, Other",
    "platformAccess": "enum (optional): Operational, View Only, Admin, None"
  },
  "contacts": [
    {
      "fullName": "string (required, max 200)",
      "type": "enum (required): Email, Phone, Other",
      "emailAddress": "string (required if type=Email, valid email)",
      "label": "string (optional, max 100)",
      "isPrimary": "boolean (optional, default false)"
    }
  ],
  "additionalInfo": [
    {
      "key": "string (required, max 100)",
      "value": "string (required, max 500)"
    }
  ],
  "status": "enum (optional, default active): active, inactive, pending"
}
```

#### Example Request
```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "organisationName": "Westfield Corporation",
    "abn": "12345678901",
    "acn": "123456789",
    "tradingName": "Westfield",
    "industryType": "Retail",
    "organisationSize": "1000+",
    "businessAddress": {
      "street": "123 Collins Street",
      "suburb": "Melbourne",
      "state": "VIC",
      "postcode": "3000"
    },
    "contacts": [
      {
        "fullName": "John Smith",
        "type": "Email",
        "emailAddress": "john@westfield.com.au",
        "label": "Primary Contact",
        "isPrimary": true
      }
    ]
  }'
```

### PUT /api/customers/:id
Update an existing customer.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | ObjectId | MongoDB ObjectId of the customer |

#### Request Body
Same schema as POST, but all fields are optional.

#### Example Request
```bash
curl -X PUT http://localhost:3000/api/customers/647abc123def456789012345 \
  -H "Content-Type: application/json" \
  -d '{
    "organisationName": "Westfield Corporation Ltd",
    "status": "active"
  }'
```

### DELETE /api/customers/:id
Delete a customer.

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | ObjectId | MongoDB ObjectId of the customer |

#### Example Request
```bash
curl -X DELETE http://localhost:3000/api/customers/647abc123def456789012345
```

## Validation

### Australian Business Number (ABN)
- Must be exactly 11 digits
- Must be unique across all customers
- Example: `12345678901`

### Australian Company Number (ACN)
- Must be exactly 9 digits (if provided)
- Example: `123456789`

### Australian States
Valid values: `NSW`, `VIC`, `QLD`, `WA`, `SA`, `TAS`, `ACT`, `NT`

### Postcodes
- Must be exactly 4 digits
- Example: `3000`, `2000`, `4000`

### Email Validation
- Must be a valid email format
- Automatically converted to lowercase
- Required when contact type is "Email"

## Error Codes

| HTTP Code | Description |
|-----------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Validation Error |
| 404 | Resource Not Found |
| 409 | Conflict (e.g., duplicate ABN) |
| 500 | Server Error |

## Debug Endpoints

### GET /api/customers/debug/collections
List all MongoDB collections (development only).

```bash
curl -X GET http://localhost:3000/api/customers/debug/collections
```

### GET /health
API health check.

```bash
curl -X GET http://localhost:3000/health
```

## Rate Limiting
Currently no rate limiting implemented (MVP phase).

## Changelog

### Version 1.0.0
- Initial release with full CRUD operations
- Schema-driven validation with Joi
- Pagination, search, and filtering
- Australian business context validation
- Comprehensive error handling