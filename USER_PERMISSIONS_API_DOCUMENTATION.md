# User Permissions API Documentation

## Overview

This document describes the API endpoints available for retrieving user permissions and role information.

---

## Available Endpoints

### 1. Get Current User's Complete Permissions Matrix

**Endpoint:** `GET /api/users/me/permissions`

**Description:** Returns a comprehensive permissions matrix for the currently authenticated user, including:
- Role-based permissions (from assigned roles)
- Resource-specific permissions (fine-grained access)
- Document-based permissions (category/discipline restrictions)

**Authentication:** Required (Bearer token)

**Response Structure:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "full_name": "User Name",
      "is_active": true
    },
    "roles": [
      {
        "id": "role_id",
        "name": "Tenants",
        "description": "Building tenants with view-only access",
        "is_active": true
      }
    ],
    "permissions": {
      "role_based": {
        "sites": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "buildings": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "floors": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "documents": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "assets": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "customers": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "analytics": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "organisations": {
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        "tenants": {
          "view": false,
          "create": false,
          "edit": false,
          "delete": false
        },
        "vendors": {
          "view": false,
          "create": false,
          "edit": false,
          "delete": false
        },
        "users": {
          "view": false,
          "create": false,
          "edit": false,
          "delete": false
        }
      },
      "resource_specific": {
        "customer_68d3929ae4c5d9b3e920a9df": {
          "resource_type": "customer",
          "resource_id": "68d3929ae4c5d9b3e920a9df",
          "resource_name": "Customer Name",
          "permissions": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          },
          "granted_at": "2025-01-01T00:00:00.000Z",
          "granted_by": "admin_id"
        },
        "site_68d3dc07d910b6e73ca387b9": {
          "resource_type": "site",
          "resource_id": "68d3dc07d910b6e73ca387b9",
          "resource_name": "Site Name",
          "permissions": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          },
          "granted_at": "2025-01-01T00:00:00.000Z",
          "granted_by": "admin_id"
        },
        "building_68d3e1de1bfdc3d6bd004643": {
          "resource_type": "building",
          "resource_id": "68d3e1de1bfdc3d6bd004643",
          "resource_name": "Building Name",
          "permissions": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          },
          "granted_at": "2025-01-01T00:00:00.000Z",
          "granted_by": "admin_id"
        }
      },
      "document_access": {
        "hasFullAccess": false,
        "allowedCategories": ["category1", "category2"],
        "allowedDisciplines": ["discipline1", "discipline2"],
        "categoryRestrictions": [...],
        "disciplineRestrictions": [...]
      }
    },
    "summary": {
      "total_roles": 1,
      "total_resource_access": 3,
      "has_document_restrictions": true,
      "document_categories": 2,
      "document_disciplines": 2
    }
  }
}
```

**Example Usage:**

```bash
curl -X GET \
  'http://localhost:30001/api/users/me/permissions' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### 2. Get All Predefined Roles

**Endpoint:** `GET /api/v2/roles`

**Description:** Retrieves all predefined roles in the system with their permissions.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `is_active` (optional): Filter by active status

**Response Example:**

```json
{
  "success": true,
  "count": 5,
  "total": 5,
  "page": 1,
  "pages": 1,
  "data": [
    {
      "_id": "role_id",
      "name": "Tenants",
      "description": "Building tenants with view-only access to their resources",
      "is_active": true,
      "permissions": [
        {
          "entity": "sites",
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        },
        {
          "entity": "buildings",
          "view": true,
          "create": false,
          "edit": false,
          "delete": false
        }
      ],
      "user_count": 1,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 3. Get Permissions Matrix (All Roles)

**Endpoint:** `GET /api/v2/roles/permissions/matrix`

**Description:** Returns a permissions matrix showing what permissions each role has across all entities.

**Response Example:**

```json
{
  "success": true,
  "data": {
    "entities": ["sites", "buildings", "floors", "tenants", "documents", "assets", "vendors", "customers", "users", "analytics"],
    "permissions": ["view", "create", "edit", "delete"],
    "matrix": [
      {
        "role_name": "Tenants",
        "role_description": "Building tenants with view-only access to their resources",
        "permissions": {
          "sites": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          },
          "buildings": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          },
          "documents": {
            "view": true,
            "create": false,
            "edit": false,
            "delete": false
          }
        }
      }
    ]
  }
}
```

---

### 4. Get User Resource Access

**Endpoint:** `GET /api/users/:id/resource-access`

**Description:** Returns the resource-specific permissions for a user.

**Parameters:**
- `id`: User ID

**Response Example:**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "access_id",
      "resource_type": "customer",
      "resource_id": "68d3929ae4c5d9b3e920a9df",
      "resource_name": "Customer Name",
      "permissions": {
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false
      },
      "granted_at": "2025-01-01T00:00:00.000Z",
      "granted_by": "admin_id"
    }
  ]
}
```

---

## Permission Types

### 1. Role-Based Permissions
- **Source:** User's assigned roles
- **Scope:** Module-level (all resources of a type)
- **Entities:** sites, buildings, floors, documents, assets, vendors, customers, users, analytics, organisations
- **Permissions:** view, create, edit, delete

### 2. Resource-Specific Permissions
- **Source:** Fine-grained user.resource_access assignments
- **Scope:** Specific resources (e.g., specific customer, site, building)
- **Granularity:** Individual resources with custom permissions
- **Permissions:** can_view, can_create, can_edit, can_delete

### 3. Document-Based Permissions
- **Source:** Document category and discipline restrictions
- **Scope:** Document filtering by category and engineering discipline
- **Restrictions:** 
  - Document categories user can view
  - Engineering disciplines user can view
- **Special:** May have full access (no restrictions) or limited access to specific categories/disciplines

---

## Use Cases

### Frontend Permission Checking

The frontend can use these endpoints to:

1. **Check if user can access a module:**
   ```javascript
   // Check role_based permissions
   const canViewSites = permissions.role_based.sites.view;
   ```

2. **Check if user can access a specific resource:**
   ```javascript
   // Check resource_specific permissions
   const resourceKey = `customer_${customerId}`;
   const canViewCustomer = permissions.resource_specific[resourceKey]?.permissions.view;
   ```

3. **Check document access:**
   ```javascript
   // Check document permissions
   const canViewAllDocuments = permissions.document_access.hasFullAccess;
   const allowedCategories = permissions.document_access.allowedCategories;
   ```

4. **Display user role information:**
   ```javascript
   // Show roles in UI
   const userRoles = permissions.roles.map(r => r.name);
   ```

---

## Summary

This API provides comprehensive permission information for the current logged-in user, including:

✅ **Role-based permissions** - Module-level access control  
✅ **Resource-specific permissions** - Fine-grained access to individual resources  
✅ **Document permissions** - Category and discipline-based restrictions  
✅ **User role information** - Assigned roles and their details  
✅ **Permission summary** - Quick overview of access levels  

The frontend can use this information to:
- Control navigation visibility
- Enable/disable UI actions
- Filter data based on permissions
- Provide user feedback about access levels


