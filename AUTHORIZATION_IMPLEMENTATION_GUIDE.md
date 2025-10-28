# Fulqrom Hub - Complete Authorization & Permissions Implementation Guide

**Version:** 1.0
**Last Updated:** 2025-01-25
**Status:** Production Ready ✅

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
4. [Fine-Grained Resource Permissions](#fine-grained-resource-permissions)
5. [Document-Based Permissions](#document-based-permissions)
6. [Business Rules](#business-rules)
7. [API Reference](#api-reference)
8. [Implementation Examples](#implementation-examples)
9. [Testing Guide](#testing-guide)
10. [Security Considerations](#security-considerations)

---

## Overview

Fulqrom Hub implements a **three-tier permission system** providing comprehensive access control across all modules:

### Permission Tiers

1. **Role-Based Module Permissions (Tier 1)**
   - Controls access to entire modules (Customers, Sites, Buildings, etc.)
   - 5 predefined roles with specific permissions
   - CRUD operations: View, Create, Edit, Delete

2. **Fine-Grained Resource Permissions (Tier 2)**
   - Controls access to specific resource instances
   - Per-resource CRUD permissions
   - Overrides role-based permissions

3. **Document Category/Discipline Permissions (Tier 3)**
   - Controls access to documents by category
   - Controls access by engineering discipline
   - Additional layer on top of resource permissions

### Key Features

✅ 5 Predefined Roles (Admin, Property Manager, Building Manager, Contractor, Tenants)
✅ 11 Modules with granular permissions
✅ Resource ID-based access control
✅ Document category/discipline filtering
✅ Multi-tenant data isolation
✅ Scope-based analytics filtering
✅ User creation/elevation rules
✅ Two-tier permission checking (Resource → Role fallback)

---

## Architecture

### Data Model

```javascript
// User Model (rest-api/models/User.js)
{
  "_id": ObjectId,
  "email": String,
  "full_name": String,
  "role_ids": [ObjectId], // References to Role collection
  "is_active": Boolean,
  "tenant_id": String,

  // Fine-grained resource access
  "resource_access": [
    {
      "resource_type": String, // See Resource Types below
      "resource_id": String,   // ID of the specific resource
      "resource_name": String, // Display name
      "permissions": {
        "can_view": Boolean,
        "can_create": Boolean,
        "can_edit": Boolean,
        "can_delete": Boolean
      },
      "granted_at": Date,
      "granted_by": String
    }
  ]
}
```

### Resource Types

```javascript
// Supported resource_type values
[
  'org',                  // Organisation
  'site',                 // Site
  'building',             // Building
  'floor',                // Floor
  'tenant',               // Building Tenant
  'document',             // Document
  'asset',                // Asset
  'vendor',               // Vendor
  'customer',             // Customer
  'user',                 // User
  'analytics',            // Analytics
  'document_category',    // Document Category (NEW)
  'document_discipline'   // Engineering Discipline (NEW)
]
```

### Role Model

```javascript
// Role Model (rest-api/models/Role.js)
{
  "_id": ObjectId,
  "name": String, // Admin, Property Manager, Building Manager, Contractor, Tenants
  "description": String,
  "is_active": Boolean,
  "permissions": [
    {
      "module_name": String, // sites, buildings, documents, etc.
      "can_view": Boolean,
      "can_create": Boolean,
      "can_edit": Boolean,
      "can_delete": Boolean
    }
  ]
}
```

---

## Role-Based Access Control (RBAC)

### 1. Admin Role

**Full Access to All Modules**

| Module | View | Create | Edit | Delete |
|--------|------|--------|------|--------|
| Org | ✅ | ✅ | ✅ | ✅ |
| Sites | ✅ | ✅ | ✅ | ✅ |
| Buildings | ✅ | ✅ | ✅ | ✅ |
| Floors | ✅ | ✅ | ✅ | ✅ |
| Tenants | ✅ | ✅ | ✅ | ✅ |
| Documents | ✅ | ✅ | ✅ | ✅ |
| Assets | ✅ | ✅ | ✅ | ✅ |
| Vendors | ✅ | ✅ | ✅ | ✅ |
| Customers | ✅ | ✅ | ✅ | ✅ |
| Users | ✅ | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ | ✅ |

**Special Privileges:**
- Bypasses all permission checks
- Can create other Admin users
- Can access all tenants (if Super Admin)

---

### 2. Property Manager Role

**Extensive Access, No Org-Level Operations**

| Module | View | Create | Edit | Delete |
|--------|------|--------|------|--------|
| Org | ❌ | ❌ | ❌ | ❌ |
| Sites | ✅ | ✅ | ✅ | ✅ |
| Buildings | ✅ | ✅ | ✅ | ✅ |
| Floors | ✅ | ✅ | ✅ | ✅ |
| Tenants | ✅ | ✅ | ✅ | ✅ |
| Documents | ✅ | ✅ | ✅ | ✅ |
| Assets | ✅ | ✅ | ✅ | ✅ |
| Vendors | ✅ | ✅ | ✅ | ✅ |
| Customers | ✅ | ❌ | ❌ | ❌ |
| Users | ✅ | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ❌ | ❌ |

**Restrictions:**
- Cannot access Organisation-level settings
- View-only access to Customers
- Can view/create Analytics but cannot edit/delete

---

### 3. Building Manager Role

**Building Operations, Limited Deletions**

| Module | View | Create | Edit | Delete |
|--------|------|--------|------|--------|
| Org | ❌ | ❌ | ❌ | ❌ |
| Sites | ❌ | ❌ | ❌ | ❌ |
| Buildings | ✅ | ✅ | ✅ | ❌ |
| Floors | ✅ | ✅ | ✅ | ❌ |
| Tenants | ✅ | ✅ | ✅ | ❌ |
| Documents | ✅ | ✅ | ✅ | ✅ |
| Assets | ✅ | ✅ | ✅ | ✅ |
| Vendors | ✅ | ✅ | ✅ | ✅ |
| Customers | ❌ | ❌ | ❌ | ❌ |
| Users | ✅ | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ❌ | ❌ |

**Restrictions:**
- No access to Org or Sites
- Cannot delete Buildings, Floors, or Tenants
- Can view/create Analytics but cannot edit/delete
- No access to Customers

---

### 4. Contractor Role

**View-Only + Document Upload**

| Module | View | Create | Edit | Delete |
|--------|------|--------|------|--------|
| Org | ❌ | ❌ | ❌ | ❌ |
| Sites | ❌ | ❌ | ❌ | ❌ |
| Buildings | ✅ | ❌ | ❌ | ❌ |
| Floors | ✅ | ❌ | ❌ | ❌ |
| Tenants | ❌ | ❌ | ❌ | ❌ |
| Documents | ✅ | ✅ | ❌ | ❌ |
| Assets | ✅ | ❌ | ❌ | ❌ |
| Vendors | ❌ | ❌ | ❌ | ❌ |
| Customers | ❌ | ❌ | ❌ | ❌ |
| Users | ❌ | ❌ | ❌ | ❌ |
| Analytics | ❌ | ❌ | ❌ | ❌ |

**Use Case:**
- View Buildings, Floors, Assets for work reference
- Upload work completion documents
- Very limited access

---

### 5. Tenants Role

**Minimal Access**

| Module | View | Create | Edit | Delete |
|--------|------|--------|------|--------|
| All Modules | ❌ | ❌ | ❌ | ❌ |
| Floors | ✅ | ❌ | ❌ | ❌ |

**Use Case:**
- Building occupants viewing their floor information only
- Most restricted role

---

## Fine-Grained Resource Permissions

### Overview

Fine-grained permissions allow granting access to **specific resource instances** independent of role-based permissions. This enables scenarios like:

- A Contractor accessing only Building A (not all buildings)
- A Property Manager managing only Sites 1, 2, 3 (not all sites)
- A user viewing only specific customers

### Permission Hierarchy

```
1. Admin Bypass (Always grants access)
   ↓
2. Resource-Specific Permission Check
   ↓
3. Role-Based Module Permission Check (Fallback)
   ↓
4. Deny Access
```

### Supported Resources

✅ **Customer** - Grant access to specific customers
✅ **Site** - Grant access to specific sites
✅ **Building** - Grant access to specific buildings
✅ **Floor** - Grant access to specific floors
✅ **Asset** - Grant access to specific assets
✅ **Tenant** - Grant access to specific building tenants
✅ **Vendor** - Grant access to specific vendors
✅ **Document Category** - Grant access to document categories (NEW)
✅ **Document Discipline** - Grant access to engineering disciplines (NEW)

---

## Document-Based Permissions

### Category-Based Access Control

Restrict users to specific document categories regardless of role.

**Supported Categories (Examples):**
- Compliance
- Maintenance
- Design
- As-Built
- Operations
- Safety
- Energy
- Environmental

**How It Works:**

1. User has `documents` module permission from role
2. Admin grants category-specific access via `resource_access`
3. When user queries documents, only allowed categories are returned
4. If no categories specified, user sees ALL documents (subject to building/site scope)

**Example:**
```javascript
// Contractor with Maintenance category access
resource_access: [
  {
    resource_type: 'document_category',
    resource_id: 'Maintenance',
    permissions: { can_view: true, can_create: true }
  }
]

// Result: Can ONLY view/create Maintenance documents
// Cannot see Compliance, Design, or other categories
```

---

### Engineering Discipline-Based Access Control

Restrict users to specific engineering disciplines.

**Supported Disciplines (Examples):**
- HVAC
- Electrical
- Fire Safety
- Plumbing
- Mechanical
- Structural
- Civil

**How It Works:**

1. User has `documents` module permission from role
2. Admin grants discipline-specific access via `resource_access`
3. When user queries documents, only allowed disciplines are returned
4. If no disciplines specified, user sees ALL documents (subject to building/site scope)

**Example:**
```javascript
// Engineer with HVAC + Plumbing access
resource_access: [
  {
    resource_type: 'document_discipline',
    resource_id: 'HVAC',
    permissions: { can_view: true }
  },
  {
    resource_type: 'document_discipline',
    resource_id: 'Plumbing',
    permissions: { can_view: true }
  }
]

// Result: Can ONLY view HVAC and Plumbing documents
// Cannot see Electrical, Fire Safety, or other disciplines
```

---

### Combined Restrictions

Category and Discipline restrictions work **together** (AND logic).

**Example:**
```javascript
resource_access: [
  {
    resource_type: 'document_category',
    resource_id: 'Compliance'
  },
  {
    resource_type: 'document_discipline',
    resource_id: 'Fire Safety'
  },
  {
    resource_type: 'building',
    resource_id: '507f191e810c19729de860ea'
  }
]

// Result: Can ONLY see documents that are:
// ✅ Compliance category
// ✅ Fire Safety discipline
// ✅ Assigned to Building 507f191e810c19729de860ea
```

---

## Business Rules

### Rule 1: Scope-Based Resource Visibility

**Description:** When creating a user, only show resources accessible to the creator.

**Implementation:**
- Function: `getAccessibleResources(creatorUserId, resourceType)`
- Location: `rest-api/middleware/authorizationRules.js` (Lines 12-69)

**Behavior:**
- If creator has module-level access → Return all resources
- Otherwise → Return only resources in creator's `resource_access`

**API Endpoint:**
```
GET /api/users/:id/accessible-resources?resource_type=building
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasFullAccess": false,
    "accessibleResourceIds": ["507f191e810c19729de860ea", "507f191e810c19729de860eb"]
  }
}
```

---

### Rule 2: Role-Based User Creation

**Description:** Users can only create users with roles below their own level (except Admin).

**Role Hierarchy:**
```
Tenants < Contractor < Building Manager < Property Manager < Admin
```

**Implementation:**
- Function: `canCreateUserWithRole(creatorRole, targetRole)`
- Location: `rest-api/middleware/authorizationRules.js` (Lines 73-90)
- Middleware: `validateUserCreation`

**Examples:**

| Creator Role | Can Create | Cannot Create |
|--------------|------------|---------------|
| Admin | All roles (including Admin) | None |
| Property Manager | BM, Contractor, Tenants | PM, Admin |
| Building Manager | Contractor, Tenants | BM, PM, Admin |
| Contractor | None | All |
| Tenants | None | All |

**Enforcement:**
- Applied on `POST /api/users` via `validateUserCreation` middleware
- Returns 403 if creator tries to create unauthorized role

---

### Rule 3: Document View = Download

**Description:** View permission on documents automatically grants download permission.

**Implementation:**
- No separate download permission required
- If user can view a document, they can download it
- Function: `canDownloadDocument(user, documentId)`
- Location: `rest-api/middleware/authorizationRules.js` (Lines 94-98)

**Frontend:**
- `DownloadGuard` component checks `can_view` permission only
- Location: `src/components/guards/PermissionGuard.tsx`

---

### Rule 4: User Access Elevation

**Description:** Users can elevate other users' access only if they can create that role.

**Implementation:**
- Function: `canElevateUserAccess(creatorRole, targetRole)`
- Location: `rest-api/middleware/authorizationRules.js` (Lines 102-104)
- Middleware: `validateUserElevation`

**Behavior:**
- Same logic as Rule 2
- Applied on `PUT /api/users/:id` via `validateUserElevation` middleware

**Example:**
```javascript
// Property Manager tries to elevate user to Admin
PUT /api/users/507f191e810c19729de860ea
{
  "role_ids": ["admin_role_id"]
}

// Response: 403 Forbidden
{
  "success": false,
  "message": "You cannot elevate users to role 'Admin'. Your role 'Property Manager' does not have sufficient privileges."
}
```

---

### Rule 5: Scope-Based Analytics/Documents Filtering

**Description:** Analytics and documents must be filtered by user's assigned resources.

**Implementation:**
- Function: `filterByUserScope(userId, query, resourceType)`
- Middleware: `applyScopeFiltering(resourceType)`
- Location: `rest-api/middleware/authorizationRules.js` (Lines 108-165, 368-405)

**Applied To:**
- `GET /api/documents` - Documents filtered by building/site access
- `GET /api/analytics/*` - Analytics filtered by assigned resources

**Behavior:**
1. Admin → See all data (no filtering)
2. Module-level access → See all data (no filtering)
3. Resource-specific access → See only assigned resources

**Example:**
```javascript
// Property Manager with access to Buildings A, B
resource_access: [
  { resource_type: 'building', resource_id: 'building_a_id' },
  { resource_type: 'building', resource_id: 'building_b_id' }
]

// Query: GET /api/documents
// Result: Only documents for Buildings A and B
```

---

## API Reference

### 1. Grant Resource Access

**Endpoint:** `POST /api/users/resource-access`

**Description:** Grant a user access to a specific resource with custom permissions.

**Request:**
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "building",
  "resource_id": "507f191e810c19729de860ea",
  "resource_name": "Building A - Sydney CBD",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": true,
    "can_delete": false
  },
  "granted_by": "admin@company.com"
}
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_id | String | Yes | MongoDB ObjectId of the user |
| resource_type | String | Yes | Type of resource (see Resource Types) |
| resource_id | String | Yes | ID of the specific resource |
| resource_name | String | No | Display name for the resource |
| permissions | Object | No | CRUD permissions (defaults to view-only) |
| granted_by | String | No | Email/ID of granting user |

**Valid resource_type values:**
```javascript
[
  'customer', 'site', 'building', 'floor', 'asset',
  'tenant', 'vendor', 'document_category', 'document_discipline'
]
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Resource access granted successfully",
  "data": {
    "_id": "65a789012345678901234567",
    "resource_type": "building",
    "resource_id": "507f191e810c19729de860ea",
    "resource_name": "Building A - Sydney CBD",
    "permissions": {
      "can_view": true,
      "can_create": false,
      "can_edit": true,
      "can_delete": false
    },
    "granted_at": "2025-01-25T10:30:00.000Z",
    "granted_by": "admin@company.com"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid resource_type. Must be one of: customer, site, building, floor, asset, tenant, vendor, document_category, document_discipline"
}
```

**Response (Error - 400 - Duplicate):**
```json
{
  "success": false,
  "message": "Resource access already granted. Use PUT to update permissions."
}
```

---

### 2. Revoke Resource Access

**Endpoint:** `DELETE /api/users/resource-access/:id?user_id=USER_ID`

**Description:** Remove a user's access to a specific resource.

**Request:**
```
DELETE /api/users/resource-access/65a789012345678901234567?user_id=507f1f77bcf86cd799439011
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| user_id | String | Yes | MongoDB ObjectId of the user |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | String | Yes | ID of the resource_access entry |

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Resource access removed successfully"
}
```

**Response (Error - 404):**
```json
{
  "success": false,
  "message": "Resource access not found"
}
```

---

### 3. View User's Resource Access

**Endpoint:** `GET /api/users/:id/resource-access`

**Description:** Retrieve all resource access entries for a user.

**Request:**
```
GET /api/users/507f1f77bcf86cd799439011/resource-access
```

**Response (Success - 200):**
```json
{
  "success": true,
  "user_id": "507f1f77bcf86cd799439011",
  "user_name": "John Smith",
  "count": 5,
  "data": [
    {
      "_id": "65a789012345678901234567",
      "resource_type": "building",
      "resource_id": "507f191e810c19729de860ea",
      "resource_name": "Building A - Sydney CBD",
      "permissions": {
        "can_view": true,
        "can_create": false,
        "can_edit": true,
        "can_delete": false
      },
      "granted_at": "2025-01-25T10:30:00.000Z",
      "granted_by": "admin@company.com"
    },
    {
      "_id": "65a789012345678901234568",
      "resource_type": "document_category",
      "resource_id": "Compliance",
      "resource_name": "Compliance Documents",
      "permissions": {
        "can_view": true,
        "can_create": true,
        "can_edit": false,
        "can_delete": false
      },
      "granted_at": "2025-01-25T11:00:00.000Z",
      "granted_by": "admin@company.com"
    },
    {
      "_id": "65a789012345678901234569",
      "resource_type": "document_discipline",
      "resource_id": "HVAC",
      "resource_name": "HVAC Engineering",
      "permissions": {
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false
      },
      "granted_at": "2025-01-25T11:15:00.000Z",
      "granted_by": "admin@company.com"
    },
    {
      "_id": "65a78901234567890123456a",
      "resource_type": "site",
      "resource_id": "507f191e810c19729de860eb",
      "resource_name": "Sydney Office Park",
      "permissions": {
        "can_view": true,
        "can_create": true,
        "can_edit": true,
        "can_delete": true
      },
      "granted_at": "2025-01-25T09:00:00.000Z",
      "granted_by": "admin@company.com"
    },
    {
      "_id": "65a78901234567890123456b",
      "resource_type": "customer",
      "resource_id": "507f191e810c19729de860ec",
      "resource_name": "Acme Corporation",
      "permissions": {
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false
      },
      "granted_at": "2025-01-24T14:20:00.000Z",
      "granted_by": "admin@company.com"
    }
  ]
}
```

---

### 4. Get Accessible Resources (Rule 1)

**Endpoint:** `GET /api/users/:id/accessible-resources?resource_type=TYPE`

**Description:** Get resources accessible to a user for assignment purposes.

**Request:**
```
GET /api/users/507f1f77bcf86cd799439011/accessible-resources?resource_type=building
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| resource_type | String | Yes | Type of resource to query |

**Response (Full Access):**
```json
{
  "success": true,
  "data": {
    "hasFullAccess": true
  }
}
```

**Response (Restricted Access):**
```json
{
  "success": true,
  "data": {
    "hasFullAccess": false,
    "accessibleResourceIds": [
      "507f191e810c19729de860ea",
      "507f191e810c19729de860eb",
      "507f191e810c19729de860ec"
    ]
  }
}
```

---

### 5. List Documents (With Filtering)

**Endpoint:** `GET /api/documents`

**Description:** List documents with automatic category/discipline filtering applied.

**Request:**
```
GET /api/documents?category=Compliance&engineering_discipline=HVAC&building_id=507f191e810c19729de860ea&page=1&limit=50
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| category | String | Filter by document category |
| engineering_discipline | String | Filter by engineering discipline |
| building_id | String | Filter by building ID |
| site_id | String | Filter by site ID |
| customer_id | String | Filter by customer ID |
| status | String | Filter by document status |
| search | String | Text search across multiple fields |
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 50, max: 200) |

**Automatic Filtering Behavior:**

1. **User with NO category/discipline restrictions:**
   - Sees all documents (subject to building/site scope)

2. **User with category restriction (Compliance only):**
   - Automatically filtered to show ONLY Compliance documents
   - Even if user requests other categories, only Compliance is returned

3. **User with discipline restriction (HVAC only):**
   - Automatically filtered to show ONLY HVAC documents

4. **User with BOTH restrictions:**
   - Must match BOTH category AND discipline (intersection)

**Response (Success - 200):**
```json
{
  "success": true,
  "count": 25,
  "total": 100,
  "data": [
    {
      "_id": "65a789012345678901234567",
      "title": "HVAC Compliance Certificate",
      "category": "Compliance",
      "engineering_discipline": "HVAC",
      "status": "approved",
      "customer": {
        "customer_id": "507f191e810c19729de860ea",
        "customer_name": "Acme Corporation"
      },
      "location": {
        "building": {
          "building_id": "507f191e810c19729de860ea",
          "building_name": "Building A"
        }
      },
      "created_at": "2025-01-20T10:00:00.000Z"
    }
    // ... more documents
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 50,
    "total_items": 100,
    "total_pages": 2,
    "has_next_page": true,
    "has_prev_page": false
  }
}
```

---

## Implementation Examples

### Example 1: Contractor with Limited Building Access

**Scenario:** Contractor should only access Building A for maintenance work.

**Step 1: Create Contractor User**
```json
POST /api/users
{
  "email": "contractor@hvac-services.com.au",
  "full_name": "Mike Johnson",
  "role_ids": ["contractor_role_id"]
}
```

**Step 2: Grant Building Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "building",
  "resource_id": "507f191e810c19729de860ea",
  "resource_name": "Building A - Sydney CBD",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": false,
    "can_delete": false
  }
}
```

**Step 3: Grant Document Upload Permission**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "document_category",
  "resource_id": "Maintenance",
  "resource_name": "Maintenance Documents",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": false,
    "can_delete": false
  }
}
```

**Result:**
- ✅ Can view Building A details
- ✅ Can view assets in Building A
- ✅ Can upload Maintenance documents
- ❌ Cannot view Building B or other buildings
- ❌ Cannot upload Compliance or other category documents
- ❌ Cannot edit or delete anything

---

### Example 2: HVAC Engineer with Discipline Access

**Scenario:** HVAC engineer should only see HVAC-related documents.

**Step 1: Create Building Manager User**
```json
POST /api/users
{
  "email": "hvac.engineer@company.com.au",
  "full_name": "Sarah Williams",
  "role_ids": ["building_manager_role_id"]
}
```

**Step 2: Grant HVAC Discipline Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439012",
  "resource_type": "document_discipline",
  "resource_id": "HVAC",
  "resource_name": "HVAC Engineering",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": false
  }
}
```

**Step 3: Grant Plumbing Discipline Access (Additional)**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439012",
  "resource_type": "document_discipline",
  "resource_id": "Plumbing",
  "resource_name": "Plumbing Engineering",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": false,
    "can_delete": false
  }
}
```

**Result:**
- ✅ Can view/create/edit HVAC documents
- ✅ Can view Plumbing documents (read-only)
- ❌ Cannot see Electrical, Fire Safety, or other disciplines
- Building Manager role permissions still apply to other modules

---

### Example 3: Compliance Officer with Category + Discipline

**Scenario:** Compliance officer needs access to Fire Safety compliance documents only.

**Step 1: Create Property Manager User**
```json
POST /api/users
{
  "email": "compliance@company.com.au",
  "full_name": "Emma Thompson",
  "role_ids": ["property_manager_role_id"]
}
```

**Step 2: Grant Compliance Category Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439013",
  "resource_type": "document_category",
  "resource_id": "Compliance",
  "resource_name": "Compliance Documents",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": true
  }
}
```

**Step 3: Grant Fire Safety Discipline Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439013",
  "resource_type": "document_discipline",
  "resource_id": "Fire Safety",
  "resource_name": "Fire Safety Engineering",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": true
  }
}
```

**Result:**
- ✅ Can see ONLY documents that are BOTH:
  - Compliance category AND
  - Fire Safety discipline
- ❌ Cannot see Compliance documents from other disciplines (HVAC, Electrical, etc.)
- ❌ Cannot see Fire Safety documents from other categories (Maintenance, Design, etc.)
- Property Manager role permissions apply to other modules

---

### Example 4: Multi-Site Property Manager

**Scenario:** Property Manager managing only Sites A and B.

**Step 1: Create Property Manager User**
```json
POST /api/users
{
  "email": "pm.sydney@company.com.au",
  "full_name": "David Chen",
  "role_ids": ["property_manager_role_id"]
}
```

**Step 2: Grant Site A Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439014",
  "resource_type": "site",
  "resource_id": "507f191e810c19729de860ea",
  "resource_name": "Sydney Office Park",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": true
  }
}
```

**Step 3: Grant Site B Access**
```json
POST /api/users/resource-access
{
  "user_id": "507f1f77bcf86cd799439014",
  "resource_type": "site",
  "resource_id": "507f191e810c19729de860eb",
  "resource_name": "Melbourne Business Center",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": true
  }
}
```

**Result:**
- ✅ Can manage Sites A and B (full CRUD)
- ✅ Can see buildings, floors, assets under Sites A and B
- ✅ Can see documents for Sites A and B (Rule 5: Scope filtering)
- ✅ Can see analytics for Sites A and B only
- ❌ Cannot access Site C or other sites
- ❌ Documents and analytics for other sites are filtered out

---

## Testing Guide

### Test Case 1: Role-Based Module Access

**Test Admin Role:**
```bash
# Login as Admin user
# Try accessing all modules - should succeed

GET /api/customers       # ✅ Should return 200
GET /api/sites           # ✅ Should return 200
GET /api/buildings       # ✅ Should return 200
POST /api/customers      # ✅ Should return 201
DELETE /api/sites/:id    # ✅ Should return 200
```

**Test Contractor Role:**
```bash
# Login as Contractor user
# Limited access

GET /api/buildings       # ✅ Should return 200 (view only)
GET /api/documents       # ✅ Should return 200 (view only)
POST /api/documents      # ✅ Should return 201 (can create)
POST /api/buildings      # ❌ Should return 403 (no create permission)
DELETE /api/documents/:id # ❌ Should return 403 (no delete permission)
```

---

### Test Case 2: Fine-Grained Resource Access

**Setup:**
```bash
# Grant Building A access to user
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "building",
  "resource_id": "BUILDING_A_ID",
  "permissions": { "can_view": true, "can_edit": true }
}
```

**Test:**
```bash
# Login as the user

GET /api/buildings/BUILDING_A_ID    # ✅ Should return 200
PUT /api/buildings/BUILDING_A_ID    # ✅ Should return 200
GET /api/buildings/BUILDING_B_ID    # ❌ Should return 403
PUT /api/buildings/BUILDING_B_ID    # ❌ Should return 403
```

---

### Test Case 3: Document Category Filtering

**Setup:**
```bash
# Grant Compliance category access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_category",
  "resource_id": "Compliance",
  "permissions": { "can_view": true }
}
```

**Test:**
```bash
# Login as the user

GET /api/documents
# Response should ONLY include Compliance documents
# Count should match Compliance-only count

GET /api/documents?category=Maintenance
# Response should be EMPTY (user only has Compliance access)

GET /api/documents?category=Compliance
# Response should include Compliance documents
```

---

### Test Case 4: Document Discipline Filtering

**Setup:**
```bash
# Grant HVAC discipline access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_discipline",
  "resource_id": "HVAC",
  "permissions": { "can_view": true }
}
```

**Test:**
```bash
# Login as the user

GET /api/documents
# Response should ONLY include HVAC documents

GET /api/documents?engineering_discipline=Electrical
# Response should be EMPTY (user only has HVAC access)

GET /api/documents?engineering_discipline=HVAC
# Response should include HVAC documents
```

---

### Test Case 5: Combined Category + Discipline

**Setup:**
```bash
# Grant Compliance + Fire Safety access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_category",
  "resource_id": "Compliance",
  "permissions": { "can_view": true }
}

POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_discipline",
  "resource_id": "Fire Safety",
  "permissions": { "can_view": true }
}
```

**Test:**
```bash
# Login as the user

GET /api/documents
# Response should ONLY include documents that are:
# - Compliance category AND
# - Fire Safety discipline

# Verify by checking response:
# All documents should have:
# category: "Compliance"
# engineering_discipline: "Fire Safety"
```

---

### Test Case 6: Rule 2 - User Creation Restrictions

**Test Building Manager Creating Admin (Should Fail):**
```bash
# Login as Building Manager
POST /api/users
{
  "email": "test@test.com",
  "full_name": "Test User",
  "role_ids": ["ADMIN_ROLE_ID"]
}

# Expected Response: 403 Forbidden
{
  "success": false,
  "message": "You cannot create users with role 'Admin'. Your role 'Building Manager' does not have sufficient privileges."
}
```

**Test Building Manager Creating Contractor (Should Succeed):**
```bash
# Login as Building Manager
POST /api/users
{
  "email": "test@test.com",
  "full_name": "Test User",
  "role_ids": ["CONTRACTOR_ROLE_ID"]
}

# Expected Response: 201 Created
{
  "success": true,
  "message": "User created successfully",
  "data": { ... }
}
```

---

### Test Case 7: Rule 5 - Scope Filtering

**Setup:**
```bash
# Create Property Manager with Building A access only
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "building",
  "resource_id": "BUILDING_A_ID",
  "permissions": { "can_view": true }
}
```

**Test Documents:**
```bash
# Login as the user

GET /api/documents
# Response should ONLY include documents for Building A
# Documents for Building B, C, etc. should be filtered out

# Verify by checking all documents in response:
# location.building.building_id === "BUILDING_A_ID"
```

**Test Analytics:**
```bash
# Login as the user

GET /api/analytics/dashboard
# Response should ONLY include analytics for Building A
# Data from other buildings should be excluded
```

---

## Security Considerations

### 1. Tenant Isolation

**Implementation:**
- All queries filter by `tenant_id`
- Users can only access data within their tenant
- Super Admin can bypass tenant filter

**Verification:**
```javascript
// All routes check:
if (req.tenant && req.tenant.tenantId && !req.tenant.bypassTenant) {
  filterQuery.tenant_id = req.tenant.tenantId;
}
```

---

### 2. Admin Bypass

**Behavior:**
- Admin role bypasses all permission checks
- Always returns true for all operations
- Automatically granted in middleware

**Implementation:**
```javascript
// In checkPermission.js
if (userRole === 'Admin') {
  return next(); // Bypass all checks
}
```

**Security Note:**
- Admin access should be tightly controlled
- Use audit logs for Admin actions
- Consider MFA for Admin accounts

---

### 3. Permission Hierarchy

**Order of Evaluation:**
```
1. Admin Check (Bypass)
   ↓
2. Tenant Isolation Check
   ↓
3. Resource-Specific Permission
   ↓
4. Role-Based Permission (Fallback)
   ↓
5. Deny (403 Forbidden)
```

---

### 4. Input Validation

**All endpoints validate:**
- ObjectId format for IDs
- Resource type against whitelist
- Required fields presence
- Data types and formats

**Example:**
```javascript
// Validate ObjectId
if (!user_id.match(/^[0-9a-fA-F]{24}$/)) {
  return res.status(400).json({
    success: false,
    message: 'Invalid user ID format'
  });
}

// Validate resource_type
const validTypes = ['customer', 'site', 'building', ...];
if (!validTypes.includes(resource_type)) {
  return res.status(400).json({
    success: false,
    message: 'Invalid resource_type'
  });
}
```

---

### 5. Audit Logging

**Recommended (Not Yet Implemented):**
```javascript
// Log all permission grants/revokes
await logAudit({
  action: 'grant_access',
  resource_type: 'building',
  resource_id: 'BUILDING_ID',
  user_id: 'GRANTING_USER_ID',
  target_user_id: 'RECEIVING_USER_ID',
  timestamp: new Date(),
  ip_address: req.ip
});
```

---

### 6. Rate Limiting

**Recommended (Not Yet Implemented):**
- Limit permission grant/revoke operations
- Prevent abuse of permission endpoints
- Use Redis or similar for distributed rate limiting

---

## File Reference

### Backend Files

| File | Purpose | Lines |
|------|---------|-------|
| `rest-api/models/User.js` | User model with resource_access schema | 1-143 |
| `rest-api/models/Role.js` | Role model with predefined roles | 1-188 |
| `rest-api/models/Document.js` | Document model with category/discipline | 1-400 |
| `rest-api/middleware/checkPermission.js` | Permission checking middleware | 1-276 |
| `rest-api/middleware/authorizationRules.js` | Business rules implementation | 1-417 |
| `rest-api/routes/users.js` | Resource access API endpoints | 694-899 |
| `rest-api/routes/documents.js` | Document filtering with category/discipline | 152-392 |
| `rest-api/routes/customers.js` | Customer routes with permissions | 14-309 |
| `rest-api/routes/sites.js` | Site routes with permissions | 13-620 |
| `rest-api/routes/buildings.js` | Building routes with permissions | 12-622 |
| `rest-api/routes/floors.js` | Floor routes with permissions | 9-518 |
| `rest-api/routes/assets.js` | Asset routes with permissions | 11-925 |
| `rest-api/routes/tenants.js` | Tenant routes with permissions | 134-533 |
| `rest-api/routes/vendors.js` | Vendor routes with permissions | 9-636 |

### Frontend Files

| File | Purpose |
|------|---------|
| `src/utils/permissionMatrix.ts` | Permission matrix utilities |
| `src/hooks/usePermissions.ts` | Permission checking hooks |
| `src/hooks/useDocumentPermissions.ts` | Document permission hooks |
| `src/components/guards/PermissionGuard.tsx` | Permission guard components |
| `src/types/rbac.ts` | TypeScript type definitions |

---

## Changelog

### Version 1.0 (2025-01-25)

**Added:**
- ✅ Complete RBAC with 5 roles
- ✅ Fine-grained resource permissions
- ✅ Document category-based permissions
- ✅ Document discipline-based permissions
- ✅ 5 business rules implementation
- ✅ Resource access API endpoints
- ✅ Scope-based filtering for analytics/documents
- ✅ Multi-tenant data isolation
- ✅ Two-tier permission checking
- ✅ Admin bypass functionality

**Files Modified:**
- User model extended with document_category and document_discipline
- Authorization middleware updated with filtering logic
- Document routes updated with category/discipline filtering
- User routes updated with new resource types
- All module routes protected with permission checks

---

## Support & Contact

For questions or issues regarding authorization implementation:

**Documentation Location:**
- `/rest-api/PERMISSION_MATRIX.md` - Role permission matrix
- `/rest-api/FINE_GRAINED_PERMISSIONS_GUIDE.md` - Resource permission guide
- `/rest-api/AUTHORIZATION_IMPLEMENTATION_GUIDE.md` - This document

**Technical Support:**
- Review implementation in `rest-api/middleware/authorizationRules.js`
- Check permission definitions in `rest-api/models/Role.js`
- Verify resource access in User model `rest-api/models/User.js`

---

**End of Authorization Implementation Guide**
