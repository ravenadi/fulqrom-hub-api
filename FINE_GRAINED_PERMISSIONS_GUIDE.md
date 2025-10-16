# Fine-Grained Permission System Guide

## Overview

The Fulqrom Hub API implements a **two-tier permission system** that combines:
1. **Resource-Specific Permissions** (Fine-grained) - Access to individual resources
2. **Role-Based Permissions** (Module-level) - Access to entire modules

**Priority**: Resource-specific permissions override role-based permissions.

---

## Table of Contents
- [Permission Structure](#permission-structure)
- [How It Works](#how-it-works)
- [API Endpoints](#api-endpoints)
- [Real-World Examples](#real-world-examples)
- [Testing Scenarios](#testing-scenarios)
- [Implementation Examples](#implementation-examples)

---

## Permission Structure

### 1. Resource-Specific Permissions (User Model)

Each user can have explicit permissions for specific resources:

```javascript
// User.resource_access array
{
  resource_type: 'customer' | 'site' | 'building' | 'floor' | 'asset' | 'tenant' | 'vendor',
  resource_id: '507f1f77bcf86cd799439011',  // MongoDB ObjectId
  resource_name: 'ABC Corporation',
  permissions: {
    can_view: true,
    can_create: false,
    can_edit: true,
    can_delete: false
  },
  granted_at: '2025-01-15T10:30:00Z',
  granted_by: 'admin@company.com'
}
```

### 2. Role-Based Permissions (Role Model)

Roles define module-level permissions:

```javascript
// Role.permissions array
{
  module_name: 'customers' | 'sites' | 'buildings' | 'floors' | 'assets' | 'tenants' | 'documents' | 'vendors' | 'users' | 'roles',
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true
}
```

---

## How It Works

### Permission Resolution Flow

```
┌─────────────────────────────────────┐
│   User tries to access resource    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Extract User ID from request       │
│  (JWT token, header, or query)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Fetch User with populated roles    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Map action → permission field      │
│  - view/read → can_view             │
│  - create/add → can_create          │
│  - edit/update → can_edit           │
│  - delete/remove → can_delete       │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Is this a      │
      │ specific       │───── NO ──────┐
      │ resource       │               │
      │ check?         │               │
      └────┬───────────┘               │
           │ YES                        │
           ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐
│ CHECK 1:             │    │ CHECK 2:             │
│ Resource-Specific    │    │ Role-Based Module    │
│ Permission           │    │ Permission           │
│                      │    │                      │
│ Does user have       │    │ Do any of user's     │
│ resource_access      │    │ roles have module    │
│ entry for this       │    │ permission?          │
│ resource?            │    │                      │
└──────┬───────────────┘    └──────┬───────────────┘
       │                           │
       │ Found & has permission    │ Found with permission
       ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  ALLOW ACCESS   │         │  ALLOW ACCESS   │
│  Source:        │         │  Source: 'role' │
│  'resource'     │         └─────────────────┘
└─────────────────┘
       │
       │ Not found → Continue to CHECK 2
       ▼
       (loops back to CHECK 2)

       │ Found but no permission
       ▼
┌─────────────────┐
│  DENY ACCESS    │
│  403 Forbidden  │
└─────────────────┘
```

### Middleware Functions

#### `checkResourcePermission(resourceType, action, getResourceId)`

Used for operations on **specific resources** (GET /customers/:id, PUT /customers/:id, DELETE /customers/:id)

```javascript
router.get('/:id',
  checkResourcePermission('customer', 'view', (req) => req.params.id),
  async (req, res) => { ... }
);
```

#### `checkModulePermission(moduleName, action)`

Used for operations on **module collections** (GET /customers, POST /customers)

```javascript
router.get('/',
  checkModulePermission('customers', 'view'),
  async (req, res) => { ... }
);
```

---

## API Endpoints

### Grant Resource Access

**Endpoint**: `POST /api/users/resource-access`

**Request Body**:
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "customer",
  "resource_id": "507f1f77bcf86cd799439012",
  "resource_name": "ABC Corporation",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_create": false,
    "can_delete": false
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Resource access granted successfully",
  "data": {
    "resource_type": "customer",
    "resource_id": "507f1f77bcf86cd799439012",
    "resource_name": "ABC Corporation",
    "permissions": { ... },
    "granted_at": "2025-01-15T10:30:00.000Z",
    "granted_by": "admin@company.com",
    "_id": "..."
  }
}
```

### Revoke Resource Access

**Endpoint**: `DELETE /api/users/resource-access/:resource_access_id?user_id=<user_id>`

**Example**: `DELETE /api/users/resource-access/507f1f77bcf86cd799439013?user_id=507f1f77bcf86cd799439011`

**Response**:
```json
{
  "success": true,
  "message": "Resource access revoked successfully"
}
```

### Get User's Resource Access

**Endpoint**: `GET /api/users/:id/resource-access`

**Query Parameters**:
- `resource_type` (optional): Filter by resource type (customer, site, building, etc.)

**Example**: `GET /api/users/507f1f77bcf86cd799439011/resource-access?resource_type=customer`

**Response**:
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "user_name": "John Doe",
  "user_email": "john@example.com",
  "count": 3,
  "data": [
    {
      "_id": "...",
      "resource_type": "customer",
      "resource_id": "507f1f77bcf86cd799439012",
      "resource_name": "ABC Corporation",
      "permissions": {
        "can_view": true,
        "can_edit": true,
        "can_create": false,
        "can_delete": false
      },
      "granted_at": "2025-01-15T10:30:00.000Z",
      "granted_by": "admin@company.com"
    }
  ]
}
```

---

## Real-World Examples

### Example 1: Site Manager with Limited Customer Access

**Scenario**: Sarah is a Site Manager who manages all sites but should only VIEW specific customers.

**Setup**:

1. **Create Role** (Site Manager):
```json
{
  "name": "Site Manager",
  "permissions": [
    {
      "module_name": "sites",
      "can_view": true,
      "can_create": true,
      "can_edit": true,
      "can_delete": true
    },
    {
      "module_name": "buildings",
      "can_view": true,
      "can_create": true,
      "can_edit": true,
      "can_delete": true
    },
    {
      "module_name": "customers",
      "can_view": false,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

2. **Grant Resource-Specific Access**:
```bash
POST /api/users/resource-access
{
  "user_id": "sarah_user_id",
  "resource_type": "customer",
  "resource_id": "acme_corp_id",
  "resource_name": "Acme Corporation",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": false,
    "can_create": false,
    "can_delete": false
  }
}
```

**Result**:
- ✅ Sarah CAN view Acme Corporation (resource-specific permission)
- ❌ Sarah CANNOT view other customers (role denies module access)
- ✅ Sarah CAN manage all sites (role grants module access)
- ✅ Sarah CAN manage all buildings (role grants module access)

---

### Example 2: Contractor with Site-Specific Access

**Scenario**: Mike is a contractor who should only access Building 5 at Metro Site.

**Setup**:

1. **Create Role** (Contractor):
```json
{
  "name": "Contractor",
  "permissions": [
    {
      "module_name": "sites",
      "can_view": false,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    },
    {
      "module_name": "buildings",
      "can_view": false,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

2. **Grant Resource-Specific Access**:
```bash
# Grant access to specific building
POST /api/users/resource-access
{
  "user_id": "mike_user_id",
  "resource_type": "building",
  "resource_id": "building_5_id",
  "resource_name": "Building 5 - Metro Site",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_create": false,
    "can_delete": false
  }
}
```

**Result**:
- ✅ Mike CAN view and edit Building 5 (resource-specific permission)
- ❌ Mike CANNOT access any other buildings (role denies module access)
- ❌ Mike CANNOT list all buildings via GET /api/buildings (no module permission)
- ✅ Mike CAN access via direct URL GET /api/buildings/building_5_id (resource permission)

---

### Example 3: Finance Team with Read-Only Customer Access

**Scenario**: Finance team needs to view all customers but not modify them.

**Setup**:

1. **Create Role** (Finance):
```json
{
  "name": "Finance",
  "permissions": [
    {
      "module_name": "customers",
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    },
    {
      "module_name": "sites",
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

**No resource-specific access needed** - role handles everything.

**Result**:
- ✅ Finance CAN view all customers (role grants module access)
- ✅ Finance CAN view any specific customer (role grants module access)
- ❌ Finance CANNOT edit customers (role denies edit permission)
- ❌ Finance CANNOT delete customers (role denies delete permission)

---

### Example 4: Account Manager with Customer-Specific Full Access

**Scenario**: Jane manages 3 specific customers and needs full control over them only.

**Setup**:

1. **Create Role** (Account Manager):
```json
{
  "name": "Account Manager",
  "permissions": [
    {
      "module_name": "customers",
      "can_view": false,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

2. **Grant Resource-Specific Access** (for each customer):
```bash
# Customer 1
POST /api/users/resource-access
{
  "user_id": "jane_user_id",
  "resource_type": "customer",
  "resource_id": "customer_1_id",
  "resource_name": "Tech Solutions Inc",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_create": true,
    "can_delete": true
  }
}

# Customer 2
POST /api/users/resource-access
{
  "user_id": "jane_user_id",
  "resource_type": "customer",
  "resource_id": "customer_2_id",
  "resource_name": "Digital Marketing Co",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_create": true,
    "can_delete": true
  }
}

# Customer 3
POST /api/users/resource-access
{
  "user_id": "jane_user_id",
  "resource_type": "customer",
  "resource_id": "customer_3_id",
  "resource_name": "Global Enterprises",
  "granted_by": "admin@company.com",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_create": true,
    "can_delete": true
  }
}
```

**Result**:
- ✅ Jane has FULL access to her 3 assigned customers (resource-specific permissions)
- ❌ Jane CANNOT see other customers in the system (role denies module access)
- ❌ Jane CANNOT list all customers via GET /api/customers (no module permission)
- ✅ Jane CAN directly access her customers via GET /api/customers/customer_1_id (resource permission)

---

## Testing Scenarios

### Test Case 1: Resource Permission Overrides Role Denial

**Setup**:
- User Role: Denies all customer access
- Resource Access: Grants view permission for Customer ABC

**Test**:
```bash
# Should SUCCEED (resource permission overrides role)
GET /api/customers/abc_customer_id
x-user-id: test_user_id
```

**Expected**: 200 OK with customer data

---

### Test Case 2: Role Permission Allows Module Access

**Setup**:
- User Role: Grants view permission for customers module
- Resource Access: None

**Test**:
```bash
# Should SUCCEED (role grants module access)
GET /api/customers
x-user-id: test_user_id
```

**Expected**: 200 OK with list of customers

---

### Test Case 3: No Permission Denies Access

**Setup**:
- User Role: Denies all customer access
- Resource Access: None

**Test**:
```bash
# Should FAIL (no permissions)
GET /api/customers/any_customer_id
x-user-id: test_user_id
```

**Expected**: 403 Forbidden

---

### Test Case 4: Inactive User Denied

**Setup**:
- User: is_active = false
- Has proper permissions

**Test**:
```bash
GET /api/customers/any_customer_id
x-user-id: inactive_user_id
```

**Expected**: 403 Forbidden - "User account is not active"

---

### Test Case 5: Inactive Role Skipped

**Setup**:
- User Role 1: is_active = false, grants customer access
- User Role 2: is_active = true, denies customer access
- Resource Access: None

**Test**:
```bash
GET /api/customers/any_customer_id
x-user-id: test_user_id
```

**Expected**: 403 Forbidden (inactive role is skipped)

---

## Implementation Examples

### Protecting a Route (Specific Resource)

```javascript
const { checkResourcePermission } = require('../middleware/checkPermission');

// Get specific customer
router.get('/:id',
  checkResourcePermission('customer', 'view', (req) => req.params.id),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

      // Permission source is available in req
      console.log('Access granted via:', req.permissionSource); // 'resource_access' or 'role'

      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update specific customer
router.put('/:id',
  checkResourcePermission('customer', 'edit', (req) => req.params.id),
  async (req, res) => {
    try {
      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete specific customer
router.delete('/:id',
  checkResourcePermission('customer', 'delete', (req) => req.params.id),
  async (req, res) => {
    try {
      await Customer.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Customer deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
```

### Protecting a Route (Module Level)

```javascript
const { checkModulePermission } = require('../middleware/checkPermission');

// List all customers
router.get('/',
  checkModulePermission('customers', 'view'),
  async (req, res) => {
    try {
      const customers = await Customer.find();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create new customer
router.post('/',
  checkModulePermission('customers', 'create'),
  async (req, res) => {
    try {
      const customer = new Customer(req.body);
      await customer.save();
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
```

### Extracting Resource ID from Different Sources

```javascript
// From URL params
checkResourcePermission('customer', 'view', (req) => req.params.id)

// From request body
checkResourcePermission('customer', 'edit', (req) => req.body.customer_id)

// From query params
checkResourcePermission('customer', 'view', (req) => req.query.customer_id)

// From nested params
checkResourcePermission('site', 'view', (req) => req.params.siteId)
```

---

## Action Mapping Reference

The system automatically maps action names to permission fields:

| Action Names | Permission Field |
|--------------|------------------|
| `view`, `read`, `get` | `can_view` |
| `create`, `add`, `post` | `can_create` |
| `edit`, `update`, `put`, `patch` | `can_edit` |
| `delete`, `remove` | `can_delete` |

---

## Security Features

### 1. Deny by Default
- No permissions = No access
- Explicit grants required

### 2. User Status Check
- Only active users (`is_active: true`) can access resources
- Inactive users immediately denied

### 3. Role Status Check
- Only active roles considered during permission checks
- Inactive roles skipped

### 4. Audit Trail
- `granted_at`: Timestamp when access was granted
- `granted_by`: Email/ID of user who granted access
- Enables tracking and compliance reporting

### 5. Permission Source Tracking
- `req.permissionSource`: Indicates if access granted via 'resource_access' or 'role'
- `req.roleName`: Name of the role that granted access (if applicable)
- Useful for logging and debugging

---

## Common Patterns

### Pattern 1: Department-Wide Access
**Use**: Role-based permissions
```javascript
// Give HR department access to all users
Role: {
  name: "HR Manager",
  permissions: [
    { module_name: "users", can_view: true, can_edit: true }
  ]
}
```

### Pattern 2: Client-Specific Access
**Use**: Resource-specific permissions
```javascript
// Account manager sees only their clients
resource_access: [
  { resource_type: "customer", resource_id: "client1_id", permissions: {...} },
  { resource_type: "customer", resource_id: "client2_id", permissions: {...} }
]
```

### Pattern 3: Temporary Access
**Use**: Resource-specific permissions (manually revoke later)
```javascript
// Grant contractor temporary access to building
POST /api/users/resource-access
{
  resource_type: "building",
  resource_id: "temp_building_id",
  permissions: { can_view: true }
}

// Later revoke
DELETE /api/users/resource-access/:access_id
```

### Pattern 4: Exception Handling
**Use**: Resource-specific permissions override role
```javascript
// User role denies customer deletion, but grant exception
Role: { module_name: "customers", can_delete: false }
Resource Access: {
  resource_type: "customer",
  resource_id: "special_customer_id",
  permissions: { can_delete: true }  // Exception!
}
```

---

## Troubleshooting

### Issue: User has role permission but still gets 403

**Possible Causes**:
1. User account is inactive (`is_active: false`)
2. Role is inactive (`is_active: false`)
3. Module name mismatch (use plural: 'customers' not 'customer')
4. Wrong action name (use 'view' not 'read', etc.)

**Debug**:
```javascript
// Check user status
GET /api/users/:id

// Check user's roles
GET /api/users/:id (includes role_ids populated)

// Check what access user has
GET /api/users/:id/resource-access
```

---

### Issue: Resource-specific permission not working

**Possible Causes**:
1. Wrong resource_type (use singular: 'customer' not 'customers')
2. Wrong resource_id (doesn't match actual document ID)
3. User ID extraction failing (check x-user-id header)

**Debug**:
```javascript
// Verify resource access was granted
GET /api/users/:id/resource-access?resource_type=customer

// Check the exact resource ID in database
db.customers.findOne({_id: ObjectId("...")})
```

---

### Issue: Can't list resources but can view specific ones

**Explanation**: This is expected behavior!
- Listing requires **module permission** (checkModulePermission)
- Viewing specific requires **resource OR module permission** (checkResourcePermission)

**Solution**: Grant module-level view permission for listing

---

## Best Practices

### 1. Start with Roles
Define roles first for broad access patterns:
```
- Admin: Full access to everything
- Manager: View/Edit most modules
- Viewer: View-only access
- Contractor: No default access (use resource-specific)
```

### 2. Use Resource-Specific for Exceptions
Only add resource_access when:
- User needs access to specific resources outside their role
- Temporary/project-based access required
- Client-specific account management

### 3. Document Permission Changes
Always include `granted_by` when granting access:
```javascript
{
  "granted_by": "admin@company.com",  // Who granted access
  "resource_name": "ABC Corp",        // What they can access
  "permissions": {...}                // What they can do
}
```

### 4. Regular Audits
Periodically review resource-specific permissions:
```bash
# Get all users with resource access
GET /api/users?has_resource_access=true

# Review each user's access
GET /api/users/:id/resource-access
```

### 5. Use Descriptive Resource Names
```javascript
// Good
resource_name: "Building 5 - Metro Site - Q1 Renovation"

// Bad
resource_name: "Building 5"
```

---

## File References

- Middleware: [middleware/checkPermission.js](middleware/checkPermission.js)
- User Model: [models/User.js](models/User.js)
- Role Model: [models/Role.js](models/Role.js)
- User Routes: [routes/users.js](routes/users.js)
- Customer Routes: [routes/customers.js](routes/customers.js)
- Site Routes: [routes/sites.js](routes/sites.js)

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────┐
│                    PERMISSION CHEAT SHEET                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  GRANT RESOURCE ACCESS:                                      │
│  POST /api/users/resource-access                             │
│  Body: { user_id, resource_type, resource_id, permissions } │
│                                                              │
│  REVOKE RESOURCE ACCESS:                                     │
│  DELETE /api/users/resource-access/:id?user_id=xxx           │
│                                                              │
│  VIEW USER ACCESS:                                           │
│  GET /api/users/:id/resource-access                          │
│                                                              │
│  PERMISSION PRIORITY:                                        │
│  1. Resource-Specific (highest)                              │
│  2. Role-Based Module                                        │
│  3. Deny (default)                                           │
│                                                              │
│  RESOURCE TYPES:                                             │
│  customer, site, building, floor, asset, tenant, vendor      │
│                                                              │
│  MODULE NAMES (plural):                                      │
│  customers, sites, buildings, floors, assets, tenants,       │
│  documents, vendors, users, roles                            │
│                                                              │
│  ACTIONS:                                                    │
│  view/read → can_view                                        │
│  create/add → can_create                                     │
│  edit/update → can_edit                                      │
│  delete/remove → can_delete                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

**Last Updated**: January 2025
**System Version**: 1.0
**Documentation Status**: Production Ready
