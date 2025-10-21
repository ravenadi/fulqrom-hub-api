# Permission Matrix - Role-Based Access Control

This document defines the permissions for each role in the Fulqrom Hub system.

## Permission Legend
- **Y** = Permission Granted
- **Empty** = Permission Denied

---

## Admin Role

| Module      | View | Create | Edit | Delete |
|-------------|------|--------|------|--------|
| Org         | Y    | Y      | Y    | Y      |
| Sites       | Y    | Y      | Y    | Y      |
| Buildings   | Y    | Y      | Y    | Y      |
| Floors      | Y    | Y      | Y    | Y      |
| Tenants     | Y    | Y      | Y    | Y      |
| Documents   | Y    | Y      | Y    | Y      |
| Assets      | Y    | Y      | Y    | Y      |
| Vendors     | Y    | Y      | Y    | Y      |
| Customer    | Y    | Y      | Y    | Y      |
| Users       | Y    | Y      | Y    | Y      |
| Analytics   | Y    | Y      | Y    | Y      |

**Notes:**
- Admin has full access to all modules and all operations
- Can create, edit, and delete all entities

---

## Property Manager Role

| Module      | View | Create | Edit | Delete |
|-------------|------|--------|------|--------|
| Org         |      |        |      |        |
| Sites       | Y    | Y      | Y    | Y      |
| Buildings   | Y    | Y      | Y    | Y      |
| Floors      | Y    | Y      | Y    | Y      |
| Tenants     | Y    | Y      | Y    | Y      |
| Documents   | Y    | Y      | Y    | Y      |
| Assets      | Y    | Y      | Y    | Y      |
| Vendors     | Y    | Y      | Y    | Y      |
| Customer    | Y    |        |      |        |
| Users       | Y    | Y      | Y    | Y      |
| Analytics   | Y    | Y      |      |        |

**Notes:**
- No access to Org (organization) level
- Full access to Sites, Buildings, Floors, Tenants, Documents, Assets, Vendors, Users
- Can VIEW Customer but cannot create/edit/delete
- Can VIEW and CREATE Analytics but cannot edit/delete

---

## Building Manager Role

| Module      | View | Create | Edit | Delete |
|-------------|------|--------|------|--------|
| Org         |      |        |      |        |
| Sites       |      |        |      |        |
| Buildings   | Y    | Y      | Y    |        |
| Floors      | Y    | Y      | Y    |        |
| Tenants     | Y    | Y      | Y    |        |
| Documents   | Y    | Y      | Y    | Y      |
| Assets      | Y    | Y      | Y    | Y      |
| Vendors     | Y    | Y      | Y    | Y      |
| Customer    |      |        |      |        |
| Users       | Y    | Y      | Y    | Y      |
| Analytics   | Y    | Y      |      |        |

**Notes:**
- No access to Org or Sites
- Can view/create/edit Buildings, Floors, Tenants (but cannot delete)
- Full access to Documents, Assets, Vendors, Users
- Can VIEW and CREATE Analytics but cannot edit/delete
- No access to Customer

---

## Contractor Role

| Module      | View | Create | Edit | Delete |
|-------------|------|--------|------|--------|
| Org         |      |        |      |        |
| Sites       |      |        |      |        |
| Buildings   | Y    |        |      |        |
| Floors      | Y    |        |      |        |
| Tenants     |      |        |      |        |
| Documents   | Y    | Y      |      |        |
| Assets      | Y    |        |      |        |
| Vendors     |      |        |      |        |
| Customer    |      |        |      |        |
| Users       |      |        |      |        |
| Analytics   |      |        |      |        |

**Notes:**
- Very limited access
- Can VIEW Buildings, Floors, Assets
- Can VIEW and CREATE Documents (for uploading work completion docs)
- No access to Tenants, Vendors, Customer, Users, Analytics

---

## Tenants Role

| Module      | View | Create | Edit | Delete |
|-------------|------|--------|------|--------|
| Org         |      |        |      |        |
| Sites       |      |        |      |        |
| Buildings   |      |        |      |        |
| Floors      | Y    |        |      |        |
| Tenants     |      |        |      |        |
| Documents   |      |        |      |        |
| Assets      |      |        |      |        |
| Vendors     |      |        |      |        |
| Customer    |      |        |      |        |
| Users       |      |        |      |        |
| Analytics   |      |        |      |        |

**Notes:**
- Minimal access - only VIEW Floors
- Cannot access or modify any other modules
- Most restricted role

---

## Business Rules

### Rule 1
When creating a user, we can multi-select Customer/Site/Floor/Buildings/Assets - only those entities are visible that are accessible to the user creating the new user.

### Rule 2
Only users with Role = BM and above can create users, but the user can only create users below their own role except for Admin. Admin can create another Admin.

### Rule 3
Document level view access allows the user to download the document as well.

### Rule 4
A user can elevate the access of another user provided that their own role fits the profile as in Rule 2.

### Rule 5
Features like analytics and documents must be restricted by the scope of access - for example, Admin may have access to multiple sites but property manager must only see docs and analytics for the sites/buildings they have access to.

---

## Implementation Notes

1. **Module Name Mapping** (API uses plural forms):
   - `Org` → `org`
   - `Sites` → `sites`
   - `Buildings` → `buildings`
   - `Floors` → `floors`
   - `Tenants` → `tenants`
   - `Documents` → `documents`
   - `Assets` → `assets`
   - `Vendors` → `vendors`
   - `Customer` → `customers`
   - `Users` → `users`
   - `Analytics` → `analytics`

2. **Permission Field Mapping**:
   - View → `can_view`
   - Create → `can_create`
   - Edit → `can_edit`
   - Delete → `can_delete`

3. **Role Names**:
   - Admin
   - Property Manager
   - Building Manager (BM)
   - Contractor
   - Tenants
