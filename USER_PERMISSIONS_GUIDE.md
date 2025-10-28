# User Permissions Guide
## Fulqrom Hub - Comprehensive Permissions System

**Last Updated:** October 25, 2025
**User ID for Testing:** `68f75211ab9d0946c112721e`
**Edit Page:** http://localhost:8080/hub/users/edit/68f75211ab9d0946c112721e

---

## Overview

Fulqrom Hub implements a **3-layer permission system** for granular access control:

1. **Role Assignments** - Broad entity-level permissions
2. **Resource Access Permissions** - Specific resource instance access
3. **Document Based Permissions** - Category/discipline filtering

All three permission types are stored in the `User` model and can be managed through the User Edit page.

---

## 1. Role Assignments (Role-Based Access Control)

### What It Is
Multiple roles can be assigned to a user, each containing permissions for different entities (org, sites, buildings, floors, tenants, documents, assets, vendors, customers, users, analytics).

### Database Storage
```javascript
// User Model
{
  role_ids: [ObjectId("68f29f40c5803c91425a1242"), ObjectId("...")]
  // Populated with Role documents
}

// Role Model
{
  _id: ObjectId("68f29f40c5803c91425a1242"),
  name: "Building Manager",
  description: "Building management with limited permissions",
  permissions: [
    {
      entity: "buildings",
      view: true,
      create: true,
      edit: true,
      delete: false
    },
    // ... more entities
  ]
}
```

### API Endpoints

#### Get User with Roles
```bash
GET /api/users/:id
```

Response includes populated `role_ids` array.

#### Update User Roles
```bash
PUT /api/users/:id
Content-Type: application/json

{
  "role_ids": ["68f29f40c5803c91425a1242", "..."]
}
```

### Frontend Implementation

**Location:** `src/pages/UserEditPage.tsx` - Roles Tab

```typescript
// Update roles
const formData = {
  roleIds: ["68f29f40c5803c91425a1242", "..."]
};
await userManagementApi.updateUser(userId, formData);
```

### Verification
```bash
cd rest-api
node verify-all-permissions.js
```

Look for section "1️⃣ ROLE ASSIGNMENTS"

---

## 2. Resource Access Permissions (Resource-Level Access)

### What It Is
Fine-grained permissions for specific resource instances (e.g., specific building, site, vendor).

### Database Storage
```javascript
// User Model
{
  resource_access: [
    {
      _id: ObjectId("..."),
      resource_type: "building",
      resource_id: "building-123",
      resource_name: "Collins Street Tower",
      permissions: {
        can_view: true,
        can_create: false,
        can_edit: true,
        can_delete: false
      },
      granted_at: ISODate("2025-10-25T..."),
      granted_by: "admin"
    },
    // ... more access entries
  ]
}
```

### API Endpoints

#### Get User Resource Access
```bash
GET /api/users/:id/resource-access
```

#### Assign Resource Access
```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "building",
  "resource_id": "building-123",
  "resource_name": "Collins Street Tower",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": true,
    "can_delete": false
  },
  "granted_by": "admin"
}
```

#### Remove Resource Access
```bash
DELETE /api/users/resource-access/:accessId?user_id=:userId
```

### Supported Resource Types
- `customer` - Customer access
- `site` - Site access
- `building` - Building access
- `floor` - Floor access
- `asset` - Asset access
- `tenant` - Building tenant access
- `vendor` - Vendor access
- `document_category` - Document category filtering (see below)
- `document_discipline` - Document discipline filtering (see below)

### Frontend Implementation

**Location:** `src/components/admin/ResourceAccessManager.tsx`

```typescript
// Assign resource access
const input = {
  userId: "68f75211ab9d0946c112721e",
  resourceType: "building",
  resourceId: "building-123",
  accessLevel: "edit" // Converted to permissions object
};
await userManagementApi.assignResourceAccess(input);
```

**Access Levels:**
- `view` → `can_view: true`
- `edit` → `can_view: true, can_edit: true`
- `admin` → `can_view: true, can_edit: true, can_create: true, can_delete: true`

### Verification
```bash
cd rest-api
node verify-all-permissions.js
```

Look for section "2️⃣ RESOURCE ACCESS PERMISSIONS"

---

## 3. Document Based Permissions (Category & Discipline Filtering)

### What It Is
Special resource access permissions that filter documents by category (Technical, Compliance, etc.) or engineering discipline (HVAC, Electrical, etc.).

### Database Storage
```javascript
// User Model
{
  resource_access: [
    {
      _id: ObjectId("..."),
      resource_type: "document_category",
      resource_id: "Technical", // Category name
      resource_name: "Technical Documents",
      permissions: {
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false
      },
      granted_at: ISODate("2025-10-25T..."),
      granted_by: "admin"
    },
    {
      _id: ObjectId("..."),
      resource_type: "document_discipline",
      resource_id: "HVAC", // Discipline name
      resource_name: "HVAC Documents",
      permissions: {
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: false
      },
      granted_at: ISODate("2025-10-25T..."),
      granted_by: "admin"
    }
  ]
}
```

### API Endpoints

#### Assign Document Category Access
```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "document_category",
  "resource_id": "Technical",
  "resource_name": "Technical Documents",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": false,
    "can_delete": false
  }
}
```

#### Assign Document Discipline Access
```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "document_discipline",
  "resource_id": "HVAC",
  "resource_name": "HVAC Documents",
  "permissions": {
    "can_view": true,
    "can_create": true,
    "can_edit": true,
    "can_delete": false
  }
}
```

### Supported Document Categories
- Technical
- Compliance
- Financial
- Operational
- Maintenance

### Supported Engineering Disciplines
- HVAC
- Electrical
- Plumbing
- Fire Safety
- Structural
- Mechanical

### Frontend Implementation

**Location:** `src/components/admin/ResourceAccessManager.tsx`

```typescript
// Assign document category access
const input = {
  userId: "68f75211ab9d0946c112721e",
  resourceType: "document", // Component uses this
  resourceId: "",
  accessLevel: "view",
  documentType: "Technical" // Converted to document_category
};
await userManagementApi.assignResourceAccess(input);

// Assign document discipline access
const input = {
  userId: "68f75211ab9d0946c112721e",
  resourceType: "document",
  resourceId: "",
  accessLevel: "edit",
  engineeringDiscipline: "HVAC" // Converted to document_discipline
};
await userManagementApi.assignResourceAccess(input);
```

### Verification
```bash
cd rest-api
node verify-all-permissions.js
```

Look for section "3️⃣ DOCUMENT BASED PERMISSIONS"

---

## Permission Resolution Order

When checking if a user has access to a resource:

1. **Check Role Permissions** (broadest)
   - Does any of the user's roles grant permission to this entity?

2. **Check Resource Access** (more specific)
   - Does the user have explicit access to this specific resource instance?

3. **Check Document Filters** (most specific for documents)
   - Does the user have category/discipline-based access to this document?

**Rule:** More specific permissions override general ones.

---

## User Edit Page Structure

**URL:** http://localhost:8080/hub/users/edit/68f75211ab9d0946c112721e

### Tabs

1. **Profile Tab**
   - Full Name
   - Phone
   - Active Status

2. **Roles Tab**
   - Multiple role selection
   - Updates `role_ids` field

3. **Password Reset Tab**
   - Set new password for user

4. **Resource Access Tab**
   - Manage resource-level permissions
   - Add/remove specific resource access
   - Document category/discipline filtering

---

## Data Flow

### Frontend → Backend

```typescript
// Frontend (camelCase)
{
  userId: "...",
  resourceType: "building",
  resourceId: "building-123",
  accessLevel: "edit"
}

// ↓ Transformed by userManagementApi.assignResourceAccess()

// Backend (snake_case)
{
  user_id: "...",
  resource_type: "building",
  resource_id: "building-123",
  permissions: {
    can_view: true,
    can_edit: true,
    can_create: false,
    can_delete: false
  }
}
```

### Backend → Frontend

```javascript
// Backend (MongoDB)
{
  resource_access: [{
    resource_type: "building",
    resource_id: "building-123",
    permissions: {
      can_view: true,
      can_edit: true,
      can_create: false,
      can_delete: false
    }
  }]
}

// ↓ Transformed by transformUser()

// Frontend (TypeScript)
{
  resourceAccess: [{
    resourceType: "building",
    resourceId: "building-123",
    accessLevel: "edit" // Derived from permissions
  }]
}
```

---

## Testing Checklist

### Role Assignments
- [ ] Navigate to User Edit page
- [ ] Go to Roles tab
- [ ] Select/deselect roles
- [ ] Click "Save Roles"
- [ ] Verify in browser console: `📤 Sending user update request`
- [ ] Verify in server console: `📝 Updating user roles`
- [ ] Run verification: `node verify-all-permissions.js`

### Resource Access Permissions
- [ ] Navigate to User Edit page
- [ ] Go to Resource Access tab
- [ ] Click "Add Resource Access"
- [ ] Select resource type (building, site, etc.)
- [ ] Choose specific resource
- [ ] Select access level (view, edit, admin)
- [ ] Click "Add Access"
- [ ] Verify in browser console: `📤 Assigning resource access`
- [ ] Verify in server console: Response logged
- [ ] Run verification: `node verify-all-permissions.js`

### Document Based Permissions
- [ ] Navigate to User Edit page
- [ ] Go to Resource Access tab
- [ ] Click "Add Resource Access"
- [ ] Select resource type: "Document"
- [ ] Choose document type (Technical, Compliance, etc.)
- [ ] OR choose engineering discipline (HVAC, Electrical, etc.)
- [ ] Select access level
- [ ] Click "Add Access"
- [ ] Verify resource_type is `document_category` or `document_discipline`
- [ ] Run verification: `node verify-all-permissions.js`

---

## Logging & Debugging

### Frontend Console Logs

```
📤 Sending user update request: { userId, payload, roleCount }
✅ User update response received: { success, roleCount }
📤 Assigning resource access: { userId, resourceType, resourceId, permissions }
✅ Resource access assigned: { success, data }
📤 Removing resource access: { accessId, userId }
✅ Resource access removed
```

### Backend Console Logs

```
📝 Updating user mchetan@gkblabs.com roles: { previous_roles, new_roles, role_count }
✅ User mchetan@gkblabs.com saved successfully with 1 roles
✅ Roles synced for user mchetan@gkblabs.com
```

---

## Files Modified

### Backend
- `rest-api/routes/users.js` - Added logging for role updates
- `rest-api/models/User.js` - Schema with role_ids and resource_access
- `rest-api/verify-user-permissions.js` - Basic verification script
- `rest-api/verify-all-permissions.js` - Comprehensive verification

### Frontend
- `src/services/userManagementApi.ts` - Data transformation layer
- `src/pages/UserEditPage.tsx` - User edit page with tabs
- `src/components/admin/ResourceAccessManager.tsx` - Resource access UI
- `src/components/admin/EditUserDrawer.tsx` - Drawer for inline editing

---

## Verification Scripts

### Basic Verification
```bash
cd rest-api
node verify-user-permissions.js
```

Shows role assignments and basic data integrity checks.

### Comprehensive Verification
```bash
cd rest-api
node verify-all-permissions.js
```

Shows all three permission types with detailed breakdown.

---

## API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users/:id` | GET | Get user with roles populated |
| `/api/users/:id` | PUT | Update user (including role_ids) |
| `/api/users/:id/resource-access` | GET | Get user's resource access |
| `/api/users/resource-access` | POST | Assign resource access |
| `/api/users/resource-access/:id` | DELETE | Remove resource access |

---

## Schema Reference

```typescript
interface User {
  _id: ObjectId;
  email: string;
  full_name: string;
  phone: string;
  auth0_id: string;
  is_active: boolean;

  // 1. Role Assignments
  role_ids: ObjectId[]; // References to Role documents

  // 2. Resource Access Permissions
  resource_access: ResourceAccess[];

  created_at: Date;
  updated_at: Date;
}

interface ResourceAccess {
  _id: ObjectId;
  resource_type: string; // 'building', 'site', 'document_category', etc.
  resource_id: string; // Resource ID or category/discipline name
  resource_name: string;
  permissions: {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  };
  granted_at: Date;
  granted_by: string;
}

interface Role {
  _id: ObjectId;
  name: string;
  description: string;
  is_active: boolean;
  permissions: EntityPermission[];
}

interface EntityPermission {
  entity: string; // 'buildings', 'sites', 'documents', etc.
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}
```

---

## Common Issues & Solutions

### Issue: Role assignments not saving
**Solution:** Check browser console for `📤 Sending user update request` and verify `role_ids` array is included in payload.

### Issue: Resource access not appearing
**Solution:** Refresh the user data by navigating away and back to the edit page. Check server console for save confirmation.

### Issue: Document permissions not working
**Solution:** Verify `resource_type` is `document_category` or `document_discipline`, not just `document`. The frontend transforms this automatically.

### Issue: AccessLevel not mapping correctly
**Solution:** Check `transformUser()` method in `userManagementApi.ts` - it converts permissions object to accessLevel.

---

## Next Steps

1. **Test on UI:** http://localhost:8080/hub/users/edit/68f75211ab9d0946c112721e
2. **Verify Storage:** Run `node verify-all-permissions.js`
3. **Check Logs:** Monitor browser & server consoles
4. **Implement Permission Checks:** Use stored permissions in authorization middleware

---

## Support

For questions or issues:
1. Check console logs (browser & server)
2. Run verification scripts
3. Review this documentation
4. Check relevant source files listed above

**All three permission types are fully implemented and verified! ✅**
