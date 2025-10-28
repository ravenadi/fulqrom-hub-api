# Authorization System - Quick Reference Guide

**Quick lookup for common authorization operations**

---

## Common API Calls

### 1. Grant Building Access

```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "building",
  "resource_id": "507f191e810c19729de860ea",
  "resource_name": "Building A",
  "permissions": {
    "can_view": true,
    "can_edit": true
  }
}
```

### 2. Grant Document Category Access

```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "document_category",
  "resource_id": "Compliance",
  "permissions": {
    "can_view": true,
    "can_create": true
  }
}
```

### 3. Grant Engineering Discipline Access

```bash
POST /api/users/resource-access
Content-Type: application/json

{
  "user_id": "507f1f77bcf86cd799439011",
  "resource_type": "document_discipline",
  "resource_id": "HVAC",
  "permissions": {
    "can_view": true
  }
}
```

### 4. View User Permissions

```bash
GET /api/users/507f1f77bcf86cd799439011/resource-access
```

### 5. Revoke Access

```bash
DELETE /api/users/resource-access/65a789012345678901234567?user_id=507f1f77bcf86cd799439011
```

---

## Resource Types

```
customer
site
building
floor
asset
tenant
vendor
document_category
document_discipline
```

---

## Document Categories (Examples)

```
Compliance
Maintenance
Design
As-Built
Operations
Safety
Energy
Environmental
```

---

## Engineering Disciplines (Examples)

```
HVAC
Electrical
Fire Safety
Plumbing
Mechanical
Structural
Civil
```

---

## Role Hierarchy

```
Tenants → Contractor → Building Manager → Property Manager → Admin
```

**Creation Rules:**
- Admin can create: All roles
- Property Manager can create: BM, Contractor, Tenants
- Building Manager can create: Contractor, Tenants
- Others: Cannot create users

---

## Permission Check Flow

```
Request
  ↓
Authentication
  ↓
Is Admin? → YES → ALLOW
  ↓ NO
Tenant Check
  ↓
Resource Permission Check
  ↓ (if not found)
Role Permission Check
  ↓
ALLOW or DENY
```

---

## Common Scenarios

### Scenario 1: Contractor for Single Building

```bash
# 1. Create contractor user
POST /api/users
{
  "email": "contractor@example.com",
  "full_name": "John Doe",
  "role_ids": ["contractor_role_id"]
}

# 2. Grant building access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "building",
  "resource_id": "BUILDING_ID",
  "permissions": { "can_view": true }
}

# 3. Grant document upload
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_category",
  "resource_id": "Maintenance",
  "permissions": { "can_view": true, "can_create": true }
}
```

### Scenario 2: Multi-Site Property Manager

```bash
# 1. Create property manager
POST /api/users
{
  "email": "pm@example.com",
  "full_name": "Jane Smith",
  "role_ids": ["property_manager_role_id"]
}

# 2. Grant site A access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "site",
  "resource_id": "SITE_A_ID",
  "permissions": { "can_view": true, "can_edit": true }
}

# 3. Grant site B access
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "site",
  "resource_id": "SITE_B_ID",
  "permissions": { "can_view": true, "can_edit": true }
}
```

### Scenario 3: HVAC Specialist

```bash
# 1. Create building manager
POST /api/users
{
  "email": "hvac@example.com",
  "full_name": "Mike Johnson",
  "role_ids": ["building_manager_role_id"]
}

# 2. Grant HVAC discipline access only
POST /api/users/resource-access
{
  "user_id": "USER_ID",
  "resource_type": "document_discipline",
  "resource_id": "HVAC",
  "permissions": { "can_view": true, "can_create": true, "can_edit": true }
}
```

---

## Quick Checks

### Check if User Can View Building

```
1. Is user Admin? → YES
2. Does user have building resource_access with can_view? → YES
3. Does user's role have buildings module view permission? → YES
```

### Check if User Can See Document

```
1. Is user Admin? → YES
2. Does document belong to user's accessible buildings? → YES
3. If category restrictions exist:
   - Is document.category in allowed categories? → YES
4. If discipline restrictions exist:
   - Is document.engineering_discipline in allowed disciplines? → YES
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 500 | Server Error |

---

## Useful Queries

### Get All Users with Access to Building X

```javascript
db.users.find({
  "resource_access.resource_type": "building",
  "resource_access.resource_id": "BUILDING_X_ID"
})
```

### Get All Category Restrictions

```javascript
db.users.find({
  "resource_access.resource_type": "document_category"
})
```

### Get All Discipline Restrictions

```javascript
db.users.find({
  "resource_access.resource_type": "document_discipline"
})
```

---

## Implementation Files

| Component | File |
|-----------|------|
| User Model | `rest-api/models/User.js` |
| Role Definitions | `rest-api/models/Role.js` |
| Permission Middleware | `rest-api/middleware/checkPermission.js` |
| Business Rules | `rest-api/middleware/authorizationRules.js` |
| Resource Access API | `rest-api/routes/users.js` (lines 694-899) |
| Document Filtering | `rest-api/routes/documents.js` (lines 281-332) |

---

**For complete documentation, see:** `AUTHORIZATION_IMPLEMENTATION_GUIDE.md`
