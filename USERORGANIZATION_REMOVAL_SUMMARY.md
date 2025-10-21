# UserOrganization Model Removal - Summary

**Date**: 2025-10-21
**Status**: ✅ COMPLETED

---

## Overview

The `UserOrganization` junction table has been removed as it's not needed with the simplified tenant architecture:

**Old Design** (Multi-organization per user):
```
User ←→ UserOrganization ←→ Organization
(many-to-many relationship)
```

**New Design** (Single tenant per user):
```
Tenant (1-to-1) → Organization
   ↓
  User
(User belongs to one Tenant via tenant_id)
```

---

## Changes Made

### 1. Model Deprecated

- **File**: `models/UserOrganization.js` → `models/UserOrganization.js.deprecated`
- **Status**: Renamed to `.deprecated` (not deleted, for reference)
- **Collection**: `user_organizations` (old) - no longer used

### 2. Organization Model Updated

- **Collection name**: `organizations` → `tenant_organisations`
- **Added field**: `tenant_id` (references Tenant model)
- **Relationship**: 1-to-1 with Tenant

### 3. Routes Updated

**File**: `routes/organizations.js`

#### Removed Endpoints:
- `GET /api/organizations/my` - Listed all user's organizations (no longer needed)
- `POST /api/organizations/switch` - Switch between organizations (no longer needed)

#### Updated Endpoints:

**POST /api/organizations/register**
- Now creates both Tenant AND Organization (1-to-1)
- Creates owner user with tenant_id
- No UserOrganization record created

**GET /api/organizations/current**
- Gets organization based on user's tenant_id
- Much simpler logic - single query

**PUT /api/organizations/:id**
- Validates user has same tenant_id as organization
- No UserOrganization membership check needed

**GET /api/organizations/:id/members**
- Returns all users with same tenant_id
- No UserOrganization query needed

### 4. Middleware Updated

**File**: `middleware/tenantContext.js`

**Simplified Logic**:
1. Get User by userId
2. Get User.tenant_id
3. Get Organization where organization.tenant_id = user.tenant_id
4. Attach to req.tenant

**Removed**:
- UserOrganization lookups
- "Primary organization" logic
- Organization switching logic
- Membership status checks

**Added**:
- Direct User → Tenant → Organization lookup
- Simplified tenant context

---

## Data Model

### Current Architecture

```
┌─────────────────┐
│  Tenant         │  Master tenant/customer
│  (tenants)      │
└────────┬────────┘
         │
         ├─ 1-to-1 ────────────┐
         │                     │
         │              ┌──────▼──────────┐
         │              │  Organization   │
         │              │  (tenant_       │
         │              │  organisations) │
         │              └─────────────────┘
         │
         ├─ 1-to-many ──────────┐
         │                      │
         │              ┌───────▼────┐
         └──────────────►  User      │
                        │  (users)   │
                        └────────────┘
```

### Collections

| Collection | Purpose | Has tenant_id? |
|------------|---------|----------------|
| `tenants` | Master tenant table | NO (IS the tenant) |
| `tenant_organisations` | SaaS subscription details for tenant | YES (1-to-1 with Tenant) |
| `users` | Users belonging to tenant | YES (many-to-1 with Tenant) |
| `sites`, `buildings`, `assets`, etc. | Resources | YES (scoped to tenant) |

**Deprecated**:
- `user_organizations` - Junction table (no longer needed)
- `organizations` - Old collection name (empty, can be dropped)

---

## Migration Impact

### No Data Loss
- UserOrganization collection was empty (0 records)
- No data migration needed

### Database Collections

**Before**:
```
- organizations (0 records)
- user_organizations (0 records)
```

**After**:
```
- tenant_organisations (0 records, ready for use)
```

---

## API Changes

### Removed Endpoints

These endpoints no longer exist:

```
GET  /api/organizations/my        → REMOVED (users only have one org)
POST /api/organizations/switch    → REMOVED (no switching needed)
```

### Registration Flow

**Old Flow**:
1. Create Organization
2. Create or find User
3. Create UserOrganization junction record
4. Set as primary organization

**New Flow**:
1. Create Tenant
2. Create Organization (with tenant_id)
3. Create or update User (with tenant_id)
4. Set organization.owner_id

---

## Benefits

### 1. **Simplified Architecture**
- No junction table to manage
- Direct relationship: User → Tenant → Organization
- Easier to understand and maintain

### 2. **Better Performance**
- Fewer JOIN queries
- No need to check "primary organization"
- Direct tenant_id lookups

### 3. **Clearer Data Model**
- 1-to-1 relationship between Tenant and Organization
- All users in a tenant see the same organization
- No confusion about "which organization am I in?"

### 4. **Easier Multi-Tenancy**
- Tenant isolation via single tenant_id field
- No risk of users seeing other tenants' data
- Simpler middleware logic

---

## Next Steps (If Needed)

### Optional Cleanup

1. **Drop old collections** (if comfortable):
   ```javascript
   db.organizations.drop()
   db.user_organizations.drop()
   ```

2. **Remove deprecated file**:
   ```bash
   rm models/UserOrganization.js.deprecated
   ```

3. **Update documentation** to reflect new architecture

### Testing

Test these scenarios:
1. New organization registration
2. User login and tenant context
3. Organization member listing
4. Organization updates
5. Multi-tenant isolation (users can't see other tenants' data)

---

## Files Modified

### Modified
- `models/Organization.js` - Collection name change
- `routes/organizations.js` - Simplified routes
- `middleware/tenantContext.js` - Simplified tenant resolution

### Deprecated
- `models/UserOrganization.js.deprecated` - Old junction model

---

## Summary

The UserOrganization junction table has been successfully removed. The new architecture is simpler and more performant:

- **Organization**: Changed collection to `tenant_organisations`, 1-to-1 with Tenant
- **Routes**: Simplified to work with direct User → Tenant relationship
- **Middleware**: Streamlined tenant context resolution
- **No data loss**: UserOrganization collection was empty

The system now correctly implements:
```
Tenant (master) → Organization (1-to-1 subscription details)
    ↓
   Users (many users per tenant)
```

All users in a tenant automatically have access to that tenant's organization. No junction table needed!
