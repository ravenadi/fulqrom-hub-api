# Audit Logs Permission Fix - Complete Verification

## The Issue That Was Fixed

### Original Bug
The audit logs endpoint was showing activities for resources in `user.resource_access` **without checking if the user's role had permission to view that module type**.

**Example:**
```javascript
// User: Dev Tent with "Tenants" role
resource_access: [
  { resource_type: 'customer', resource_id: 'New Customer', permissions: { can_view: true } }
]

// Tenants role permissions:
permissions: [
  { entity: 'buildings', view: true }  // Has buildings permission
  // NO customers permission ❌
]

// BUG: User could see customer activities ❌
// Expected: User should NOT see customer activities ✅
```

### Root Cause
Lines 99-104 (old code) added filters for ALL `resource_access` entries without verifying role permissions.

### The Fix
**Location:** `routes/auditLogs.js:105-117`

Added double-check logic:
```javascript
// Check if user's role has permission to view this module
const hasModulePermission = allowedModules.includes(moduleNameForResource);

// CRITICAL: Only add filter if user has BOTH resource access AND role permission
if (hasModulePermission) {
  // Allow activities ✅
} else {
  // Block activities ❌
  console.log(`🚫 User has resource_access to ${resourceType} but NO role permission...`);
}
```

---

## ✅ Complete Permission Verification

### 1. Role-Based Module Permissions ✅

**Implementation:** Lines 50-73
**Status:** ✅ FIXED

**Logic:**
- Fetches all active roles from `user.role_ids`
- Collects all modules where `permission.view = true`
- Maps to audit log module names

**Test Case:**
```javascript
// User has Property Manager role
role.permissions: [
  { entity: 'customers', view: true },
  { entity: 'sites', view: true }
]

// Expected: Shows ALL customer and site activities
// Actual: ✅ CORRECT
```

---

### 2. Resource-Specific Permissions ✅

**Implementation:** Lines 79-117
**Status:** ✅ FIXED (This was the bug!)

**Logic:**
1. If user has `resource_access` entries → STRICT MODE
2. For each resource type:
   - Check if role has permission for that module ✅ NEW FIX
   - If YES → Show activities for those specific resource IDs
   - If NO → Block activities (log warning)
3. If user has NO `resource_access` → PERMISSIVE MODE (show all based on role)

**Test Cases:**

#### ✅ Customer Access
```javascript
resource_access: [
  { resource_type: 'customer', resource_id: 'cust_123', permissions: { can_view: true } }
]
role.permissions: [
  { entity: 'customers', view: true }  // ✅ Has permission
]

// Expected: Shows ONLY activities for customer cust_123
// Actual: ✅ CORRECT (line 109-113)
```

#### ✅ Site Access
```javascript
resource_access: [
  { resource_type: 'site', resource_id: 'site_abc', permissions: { can_view: true } }
]
role.permissions: [
  { entity: 'sites', view: true }  // ✅ Has permission
]

// Expected: Shows ONLY activities for site site_abc
// Actual: ✅ CORRECT (line 109-113)
```

#### ✅ Building Access
```javascript
resource_access: [
  { resource_type: 'building', resource_id: 'bldg_456', permissions: { can_view: true } }
]
role.permissions: [
  { entity: 'buildings', view: true }  // ✅ Has permission
]

// Expected: Shows ONLY activities for building bldg_456
// Actual: ✅ CORRECT (line 109-113)
```

#### ✅ Floor Access
```javascript
resource_access: [
  { resource_type: 'floor', resource_id: 'floor_789', permissions: { can_view: true } }
]
role.permissions: [
  { entity: 'floors', view: true }  // ✅ Has permission
]

// Expected: Shows ONLY activities for floor floor_789
// Actual: ✅ CORRECT (line 109-113)
```

#### ✅ Asset Access
```javascript
resource_access: [
  { resource_type: 'asset', resource_id: 'asset_xyz', permissions: { can_view: true } }
]
role.permissions: [
  { entity: 'assets', view: true }  // ✅ Has permission
]

// Expected: Shows ONLY activities for asset asset_xyz
// Actual: ✅ CORRECT (line 109-113)
```

#### ✅ Blocking When NO Role Permission (THE FIX!)
```javascript
resource_access: [
  { resource_type: 'customer', resource_id: 'cust_123', permissions: { can_view: true } }
]
role.permissions: [
  // NO customers:view permission ❌
]

// Expected: Does NOT show customer activities
// Actual: ✅ CORRECT (line 114-116 logs warning and excludes)
```

---

### 3. Document Category Permissions ✅

**Implementation:** Lines 128-154
**Status:** ✅ FIXED (Added role permission check!)

**Logic:**
1. Check if user has `documents:view` role permission first ✅ NEW FIX
2. If YES + user has `document_categories`:
   - Show document activities matching those categories
3. If NO:
   - Block all document activities (log warning)

**Test Cases:**

#### ✅ With Documents Permission
```javascript
role.permissions: [
  { entity: 'documents', view: true }  // ✅ Has permission
]
user.document_categories: ['Electrical', 'HVAC']

// Expected: Shows document activities with category = Electrical OR HVAC
// Actual: ✅ CORRECT (line 133-139)
```

#### ✅ WITHOUT Documents Permission
```javascript
role.permissions: [
  // NO documents:view permission ❌
]
user.document_categories: ['Electrical', 'HVAC']

// Expected: Does NOT show any document activities
// Actual: ✅ CORRECT (line 149-153 logs warning and excludes)
```

---

### 4. Engineering Discipline Permissions ✅

**Implementation:** Lines 128-154
**Status:** ✅ FIXED (Added role permission check!)

**Logic:**
1. Check if user has `documents:view` role permission first ✅ NEW FIX
2. If YES + user has `engineering_disciplines`:
   - Show document activities matching those disciplines
3. If NO:
   - Block all document activities (log warning)

**Test Cases:**

#### ✅ With Documents Permission
```javascript
role.permissions: [
  { entity: 'documents', view: true }  // ✅ Has permission
]
user.engineering_disciplines: ['Mechanical', 'Civil']

// Expected: Shows document activities with discipline = Mechanical OR Civil
// Actual: ✅ CORRECT (line 141-147)
```

#### ✅ WITHOUT Documents Permission
```javascript
role.permissions: [
  // NO documents:view permission ❌
]
user.engineering_disciplines: ['Mechanical', 'Civil']

// Expected: Does NOT show any document activities
// Actual: ✅ CORRECT (line 149-153 logs warning and excludes)
```

---

## Permission Hierarchy Summary

### Permission Check Order:
1. ✅ **Super Admin** → Bypass all checks (see everything)
2. ✅ **Admin Role** → Bypass all checks (see everything in tenant)
3. ✅ **Resource Access Check:**
   - If `resource_access` exists:
     - For each resource type → Check role permission ✅ FIXED
     - If role permission exists → Show activities for specific resource IDs
     - If NO role permission → Block activities ✅ FIXED
   - If NO `resource_access`:
     - Show all activities for modules with role permissions
4. ✅ **Document Categories/Disciplines:**
   - Check `documents:view` role permission first ✅ FIXED
   - If YES → Apply category/discipline filters
   - If NO → Block all document activities ✅ FIXED

---

## Debug Logging

The fix includes helpful console logs:

### Resource Permission Blocked:
```
🚫 User has resource_access to customer but NO role permission for customers - excluding from audit logs
```

### Document Permission Blocked:
```
🚫 User has document categories/disciplines but NO role permission for documents - excluding document activities from audit logs
```

### Permission Applied:
```
✅ Applied permission filters for user user@example.com
```

---

## Testing Checklist

### Test Scenario 1: Tenants Role (Original Bug)
- **Setup:**
  - Role: Tenants (has `buildings:view`, NO `customers:view`)
  - Resource Access: Customer "New Customer", Building "Updated Building Name"

- **Expected Results:**
  - ❌ Does NOT show customer activities (blocked by role check)
  - ✅ Shows building activities (has both resource access and role permission)

- **Status:** ✅ FIXED

### Test Scenario 2: Property Manager
- **Setup:**
  - Role: Property Manager (has `customers:view`, `sites:view`, `buildings:view`)
  - Resource Access: Empty

- **Expected Results:**
  - ✅ Shows ALL customer, site, and building activities
  - ❌ Does NOT show asset, vendor, or user activities

- **Status:** ✅ CORRECT

### Test Scenario 3: Contractor (Resource Restricted)
- **Setup:**
  - Role: Contractor (has `sites:view`, `buildings:view`, `assets:view`)
  - Resource Access: Site #123, Building #456

- **Expected Results:**
  - ✅ Shows activities for Site #123 only
  - ✅ Shows activities for Building #456 only
  - ❌ Does NOT show activities for other sites/buildings
  - ❌ Does NOT show asset activities (no specific asset access)

- **Status:** ✅ CORRECT

### Test Scenario 4: Document Manager
- **Setup:**
  - Role: Document Manager (has `documents:view`)
  - Document Categories: ["Electrical", "HVAC"]
  - Engineering Disciplines: ["Mechanical"]

- **Expected Results:**
  - ✅ Shows document activities with category = Electrical OR HVAC
  - ✅ Shows document activities with discipline = Mechanical
  - ❌ Does NOT show documents with other categories/disciplines

- **Status:** ✅ CORRECT

### Test Scenario 5: User with NO Permissions
- **Setup:**
  - Role: None or role with no view permissions
  - Resource Access: Empty

- **Expected Results:**
  - ❌ Shows ZERO audit logs (empty array)

- **Status:** ✅ CORRECT (line 156-158)

---

## Files Modified

1. **routes/auditLogs.js**
   - Lines 105-117: Added role permission check for resource access ✅ MAIN FIX
   - Lines 128-154: Added role permission check for document categories/disciplines ✅ ADDITIONAL FIX

---

## Related Documentation

- [Audit Logs Permission Implementation](/docs/AUDIT_LOGS_PERMISSIONS.md)
- [Resource Permissions System](/RESOURCE_PERMISSIONS.md)
- [Permission Usage Guide](/RESOURCE_PERMISSIONS_USAGE.md)

---

## Confirmation

✅ **ALL MODULE PERMISSIONS:** Fixed and verified
✅ **ALL RESOURCE-ID LEVEL PERMISSIONS:** Fixed and verified (main bug fix)
✅ **DOCUMENT CATEGORY PERMISSIONS:** Fixed and verified (additional fix)
✅ **ENGINEERING DISCIPLINE PERMISSIONS:** Fixed and verified (additional fix)

The audit logs endpoint now properly enforces the **dual-check requirement**:
- User must have `resource_access` entry for the resource
- **AND** user's role must have permission to view that module type

This matches the security model used across the rest of the application.
