# Audit Logs Permission-Based Filtering

## Overview

The Activity Timeline (Audit Logs) endpoint now implements role and permission-based filtering to ensure users only see activities for resources they have access to.

## Implementation

### File: `routes/auditLogs.js`

The audit logs endpoint now applies the same permission filtering pattern used in other routes like `/customers`, `/sites`, etc.

## Permission Levels

### 1. **Super Admin** (Bypass All Filters)
- ✅ Can see ALL audit logs across ALL tenants
- Uses `X-Tenant-Id` header to view specific tenant's logs

### 2. **Admin Role** (Bypass All Filters)
- ✅ Can see ALL audit logs within their tenant
- No resource restrictions applied

### 3. **Role-Based Module Permissions**
- Users with role permissions like `customers:view` can see ALL activities for that module
- Example: Property Manager with `sites:view` sees all site activities

### 4. **Resource-Specific Permissions**
- Users with `resource_access` entries only see activities for those specific resources
- Example: Contractor assigned to Site #123 only sees Site #123 activities

### 5. **Document Category/Discipline Permissions**
- Users with `document_categories` or `engineering_disciplines` arrays
- Only see document activities matching their allowed categories/disciplines

## Filter Logic

The filter uses **OR logic** across permission sources:
```javascript
{
  $or: [
    // Module-level: User has customers:view permission
    { module: 'customer' },

    // Resource-specific: User has access to Site #123
    { module: 'site', module_id: ObjectId('123') },

    // Document category: User can view "Electrical" category
    { module: 'document', 'detail.category': 'Electrical' },

    // Document discipline: User can view "HVAC" discipline
    { module: 'document', 'detail.discipline': 'HVAC' }
  ]
}
```

## Module Mapping

Audit log `module` field → User role permission `entity`:

| Audit Log Module | Permission Entity |
|------------------|-------------------|
| `customer`       | `customers`       |
| `site`           | `sites`           |
| `building`       | `buildings`       |
| `floor`          | `floors`          |
| `tenant`         | `tenants`         |
| `building_tenant`| `tenants`         |
| `document`       | `documents`       |
| `asset`          | `assets`          |
| `vendor`         | `vendors`         |
| `contact`        | `contacts`        |
| `user`           | `users`           |
| `auth`           | `auth`            |

## Affected Endpoints

### 1. `GET /api/audit-logs`
- Lists audit logs with pagination
- **Applies permission filtering** ✅

### 2. `GET /api/audit-logs/stats`
- Returns audit log statistics
- **Applies permission filtering** ✅

### 3. `GET /api/audit-logs/tenants`
- Lists available tenants (Super Admin only)
- No changes needed

### 4. `POST /api/audit-logs`
- Creates new audit log entry
- No changes needed (creates logs, doesn't filter)

## Testing Scenarios

### Scenario 1: Admin User
**Setup:**
- User has Admin role

**Expected:**
- ✅ Sees ALL audit logs in their tenant
- ✅ No filtering applied

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### Scenario 2: Property Manager with Module Permission
**Setup:**
- User has Property Manager role
- Role has permissions: `customers:view`, `sites:view`, `buildings:view`

**Expected:**
- ✅ Sees customer activities (all customers)
- ✅ Sees site activities (all sites)
- ✅ Sees building activities (all buildings)
- ❌ Does NOT see asset, vendor, or user activities

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs?resource_type=site" \
  -H "Authorization: Bearer $PROPERTY_MANAGER_TOKEN"
```

---

### Scenario 3: Contractor with Resource-Specific Access
**Setup:**
- User has Contractor role
- `resource_access`:
  - Site #ABC123 (can_view: true)
  - Building #DEF456 (can_view: true)

**Expected:**
- ✅ Sees activities for Site #ABC123 only
- ✅ Sees activities for Building #DEF456 only
- ❌ Does NOT see activities for other sites/buildings
- ❌ Does NOT see customer, vendor, or user activities

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs" \
  -H "Authorization: Bearer $CONTRACTOR_TOKEN"
```

---

### Scenario 4: Document Manager with Category Permissions
**Setup:**
- User has Document Manager role
- Role has permission: `documents:view`
- `document_categories`: ["Electrical", "HVAC"]

**Expected:**
- ✅ Sees ALL document activities (via documents:view permission)
- ✅ Additionally sees document activities filtered by Electrical/HVAC categories

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs?resource_type=document" \
  -H "Authorization: Bearer $DOCUMENT_MANAGER_TOKEN"
```

---

### Scenario 5: User with NO Permissions
**Setup:**
- User has no role permissions
- User has no resource_access entries

**Expected:**
- ❌ Sees ZERO audit logs
- Returns empty array

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs" \
  -H "Authorization: Bearer $NO_PERMISSION_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 0,
  "total": 0,
  "page": 1,
  "pages": 0,
  "data": []
}
```

---

### Scenario 6: Mixed Permissions
**Setup:**
- User has Building Manager role
- Role has permissions: `buildings:view`, `floors:view`
- `resource_access`:
  - Customer #111 (can_view: true)

**Expected:**
- ✅ Sees ALL building activities (via buildings:view)
- ✅ Sees ALL floor activities (via floors:view)
- ✅ Sees activities for Customer #111 (via resource_access)
- ❌ Does NOT see activities for other customers, sites, assets, vendors

**Test:**
```bash
curl -X GET "http://localhost:30001/api/audit-logs" \
  -H "Authorization: Bearer $BUILDING_MANAGER_TOKEN"
```

---

## Debug Logging

Permission filter application is logged to console:

```javascript
console.log(`🔒 Applied permission filters for user ${currentUser.email}:`,
  JSON.stringify(permissionFilters, null, 2));
```

**Example output:**
```json
{
  "$or": [
    { "module": "customer" },
    { "module": "site" },
    { "module": "building", "module_id": { "$in": ["abc123", "def456"] } },
    { "module": "document", "detail.category": { "$in": ["Electrical", "HVAC"] } }
  ]
}
```

## Performance Considerations

### Indexes
The `AuditLog` model already has these indexes:
- `{ tenant_id: 1, created_at: -1 }` - Tenant + date filtering
- `{ module: 1, action: 1 }` - Module filtering
- `{ 'module_id': 1 }` - Resource filtering
- `{ 'user.id': 1, created_at: -1 }` - User filtering

### Query Performance
- **Best case:** Admin/Super Admin → No extra filtering
- **Module permissions:** Simple `module: { $in: [...] }` query
- **Resource permissions:** `module + module_id` compound filter (indexed)
- **Document filters:** Uses `detail.category` and `detail.discipline` fields

### Recommendations
- Consider adding composite index: `{ module: 1, module_id: 1, tenant_id: 1 }`
- Monitor query performance for users with many resource_access entries (100+)

## Code Reference

### Main Filter Function
**Location:** `routes/auditLogs.js:30-130`
```javascript
async function buildPermissionFilters(user) {
  // Builds $or filter based on:
  // 1. Role-based module permissions
  // 2. Resource-specific access
  // 3. Document category/discipline permissions
}
```

### Applied In
1. **GET /api/audit-logs** - `routes/auditLogs.js:223-242`
2. **GET /api/audit-logs/stats** - `routes/auditLogs.js:349-360`

## Migration Notes

### No Database Changes Required
- Uses existing `User.resource_access` schema
- Uses existing `User.document_categories` and `engineering_disciplines`
- Uses existing `AuditLog` schema fields

### Backward Compatibility
- ✅ Existing audit log queries continue to work
- ✅ Super Admin and Admin users see no difference
- ✅ New filtering only applies to non-admin users

## Related Documentation

- [Resource Permissions](/RESOURCE_PERMISSIONS.md)
- [Permission System](/RESOURCE_PERMISSIONS_USAGE.md)
- [User Model Schema](/models/User.js)
- [Audit Log Model Schema](/models/AuditLog.js)
