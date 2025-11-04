# Entity Relationship Diagram (ERD)
## Complete Application Database Schema

This document provides a comprehensive ER diagram of the Fulqrom Hub REST API database structure.

---

## Entity Overview

### Core SaaS Entities
1. **Tenant** - Master tenant/subscription entity
2. **Organization** - Detailed organization information (1:1 with Tenant)
3. **Plan** - Subscription plans
4. **TenantOrg** - Additional organization details (1:1 with Tenant)

### User & Access Control
5. **User** - System users
6. **Role** - Permission roles
7. **UserSession** - Active user sessions
8. **AuditLog** - Audit trail

### Property Hierarchy
9. **Site** - Properties/sites
10. **Building** - Buildings within sites
11. **Floor** - Floors within buildings
12. **BuildingTenant** - Building tenant leases

### Asset & Vendor Management
13. **Asset** - Equipment/assets
14. **Vendor** - Contractors/vendors
15. **Customer** - Legacy customer model

### Document Management
16. **Document** - Documents/files
17. **DocumentComment** - Document review comments
18. **Notification** - In-app notifications

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE SAAS ENTITIES                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │  Plan    │
    └────┬─────┘
         │ 1
         │
         │ *
    ┌────▼─────────┐     1:1      ┌──────────────┐     1:1      ┌─────────────┐
    │   Tenant     │◄─────────────►│ Organization │◄───────────►│  TenantOrg   │
    └────┬─────────┘               └──────┬───────┘              └─────────────┘
         │ 1                               │ *
         │                                 │
         │                                 │ 1 (owner_id)
         │                                 │
         │                                 │
    ┌────▼────────────────────────────────▼──────────────────────────────────┐
    │                         USER & ACCESS CONTROL                           │
    └─────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐         * ┌──────────────┐ *      ┌─────────────┐
    │   Role   │◄─────────►│     User     │◄───────►│ UserSession  │
    └──────────┘           └──────┬───────┘  1     └─────────────┘
                                   │ *
                                   │
                                   │
                            ┌──────▼──────┐
                            │  AuditLog   │
                            └─────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         PROPERTY HIERARCHY                              │
    └─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   Customer   │ (Legacy)
    └──────┬───────┘
           │ 1
           │
           │ *
    ┌──────▼──────┐     1      ┌───────────┐     1      ┌──────────┐
    │    Site     │◄──────────►│  Building  │◄──────────►│  Floor   │
    └─────────────┘     *     └─────┬──────┘     *     └─────┬─────┘
           │                        │                        │
           │ *                      │ *                      │ *
           │                        │                        │
    ┌──────▼────────────────────────▼────────────────────────▼───────┐
    │                                                               │
    │                     BuildingTenant                           │
    │            (Many-to-Many: Organization ↔ Building/Floor)     │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                      ASSET & VENDOR MANAGEMENT                          │
    └─────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐                      ┌──────────┐
    │  Asset   │                      │  Vendor  │
    └────┬─────┘                      └──────────┘
         │
         │ Links to: Site, Building, Floor, Customer

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         DOCUMENT MANAGEMENT                             │
    └─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐     1      ┌─────────────────┐
    │   Document   │◄──────────►│ DocumentComment │
    └──────┬───────┘     *      └─────────────────┘
           │
           │ Links to: Site, Building, Floor, Asset, BuildingTenant, Vendor
           │
           │
    ┌──────▼──────┐
    │Notification│ (Document-related notifications)
    └────────────┘

```

---

## Detailed Entity Relationships

### 1. Tenant ↔ Organization (One-to-One)
- **Tenant** `tenant_id` (unique) → **Organization** `tenant_id`
- **Organization** `owner_id` → **User** `_id` (Many-to-One)
- Both reference **Plan** via `plan_id`

### 2. User ↔ Role (Many-to-Many)
- **User** `role_ids[]` → **Role** `_id`
- **User** `resource_access[]` - Embedded fine-grained permissions

### 3. Site ↔ Building ↔ Floor (Hierarchical One-to-Many)
- **Site** `_id` → **Building** `site_id` (1:N)
- **Building** `_id` → **Floor** `building_id` (1:N)
- **Floor** also references **Site** directly (`site_id`)

### 4. BuildingTenant (Junction Table)
- **BuildingTenant** `tenant_id` → **Organization** `_id` (Many-to-One)
- **BuildingTenant** `site_id` → **Site** `_id` (Many-to-One)
- **BuildingTenant** `building_id` → **Building** `_id` (Many-to-One)
- **BuildingTenant** `floor_id` → **Floor** `_id` (Many-to-One)
- **BuildingTenant** `customer_id` → **Customer** `_id` (Many-to-One)

### 5. Asset Relationships
- **Asset** `customer_id` → **Customer** `_id` (Many-to-One)
- **Asset** `site_id` → **Site** `_id` (Many-to-One)
- **Asset** `building_id` → **Building** `_id` (Many-to-One)
- **Asset** `floor_id` → **Floor** `_id` (Many-to-One)

### 6. Document Relationships (Polymorphic/Embedded)
- **Document** `location.site.site_id` → **Site** `_id`
- **Document** `location.building.building_id` → **Building** `_id`
- **Document** `location.floor.floor_id` → **Floor** `_id`
- **Document** `location.assets[].asset_id` → **Asset** `_id`
- **Document** `location.tenant.tenant_id` → **BuildingTenant** `_id`
- **Document** `location.vendor.vendor_id` → **Vendor** `_id`
- **Document** `customer.customer_id` → **Customer** `_id`
- **DocumentComment** `document_id` → **Document** `_id` (1:N)

### 7. UserSession
- **UserSession** `user_id` → **User** `_id` (Many-to-One)
- **UserSession** `tenant_id` → **Tenant** `_id` (Many-to-One)

### 8. AuditLog
- **AuditLog** `user.id` → **User** `_id` (Many-to-One)
- **AuditLog** `tenant_id` → **Tenant** `_id` (Many-to-One)
- **AuditLog** `module_id` → Various entities (Polymorphic)

### 9. Notification
- **Notification** `user_id` / `user_email` → **User** (Many-to-One)
- **Notification** `document_id` → **Document** `_id` (Many-to-One)
- **Notification** `comment_id` → **DocumentComment** `_id` (Many-to-One)

---

## Entity Attributes Summary

### Tenant
- `tenant_name`, `phone`, `status`, `plan_id`
- `s3_bucket_name`, `s3_bucket_region`, `s3_bucket_status`
- `plan_status` (nested: is_active, is_trial, dates)

### Organization
- `name`, `slug`, `email`, `phone`, `abn`, `acn`
- `address`, `plan_id`, `status`
- `limits` (users, buildings, sites, storage_gb)
- `current_usage` (tracking)
- `branding`, `settings`, `billing`
- `owner_id` → User

### User
- `email` (unique), `full_name`, `phone`
- `auth0_id`, `custom_id`
- `role_ids[]` → Role
- `resource_access[]` (embedded: fine-grained permissions)
- `document_categories[]`, `engineering_disciplines[]`
- `mfa_required`, `is_active`

### Role
- `name` (unique), `description`
- `permissions[]` (embedded: entity → view/create/edit/delete)

### Plan
- `name`, `plan_tier`, `slug`, `description`
- `price`, `time_period`, `trial_period_days`
- `max_users`, `max_documents`, `max_storage_gb`
- `features`, `is_active`, `is_default`

### Site
- `site_name`, `site_code`, `type`, `security_level`
- `address`, `manager` (embedded)
- `customer_id` → Customer
- `tenant_id` (multi-tenancy)

### Building
- `building_name`, `building_code`, `building_type`, `primary_use`
- `site_id` → Site, `customer_id` → Customer
- `address`, `manager` (embedded)
- `number_of_floors`, `total_area`, `year_built`
- `nabers_rating`, `parking_spaces`
- `tenant_id` (multi-tenancy)

### Floor
- `floor_name`, `floor_number`, `floor_type`
- `site_id` → Site, `building_id` → Building
- `maximum_occupancy`, `occupancy_type`, `access_control`
- `fire_compartment`, `hvac_zones`
- `area_number`, `area_unit`, `floor_area`
- `tenant_id` (multi-tenancy)

### BuildingTenant
- `tenant_id` → Organization
- `site_id`, `building_id`, `floor_id` (location)
- `tenant_name`, `tenant_legal_name`, `tenant_trading_name`
- `abn`, `acn`
- `lease_type`, `lease_start_date`, `lease_end_date`
- `occupied_area`, `number_of_employees`
- `contacts[]`, `emergency_contacts[]`
- `industry_type`, `business_category`
- `utilities_included`, `services_included`
- `rental_rate`, `bond_amount`, `tenant_status`
- `customer_id` → Customer

### Asset
- `asset_id`, `asset_no`, `device_id`
- `customer_id`, `site_id`, `building_id`, `floor_id`
- `status`, `category`, `type`, `condition`, `criticality_level`
- `make`, `model`, `serial`
- `refrigerant`, `refrigerant_capacity`
- `date_of_installation`, `last_test_date`
- `purchase_cost_aud`, `current_book_value_aud`
- `tenant_id` (multi-tenancy)

### Vendor
- `contractor_name`, `trading_name`, `abn`
- `email`, `phone`, `website`, `address`
- `contractor_type`, `consultant_specialisation`, `category`
- `contacts[]` (with primary flag)
- `licenses[]`, `insurances[]`, `certifications[]` (embedded)
- `services_provided[]`
- `performance_rating`, `preferred_provider`
- `status`, `rating`
- `tenant_id` (multi-tenancy)

### Customer (Legacy)
- `organisation` (embedded: name, email_domain, logo_url)
- `company_profile` (embedded: business_number, trading_name)
- `business_address`, `postal_address`
- `contact_methods[]` (embedded)
- `plan_id` → Plan
- `plan_start_date`, `plan_end_date`, `is_trial`
- `tenant_id` (multi-tenancy)

### Document
- `name`, `description`, `version`
- `category`, `type`, `engineering_discipline`
- `status`, `regulatory_framework`, `compliance_status`
- `file` (embedded: file_meta with S3 details)
- `tags`, `location` (embedded: site, building, floor, assets[], tenant, vendor)
- `customer` (embedded: customer_id)
- `drawing_info` (embedded: date_issued, drawing_status, etc.)
- `access_control` (embedded: access_level, access_users[])
- `approval_config` (embedded: enabled, status, approvers[], approval_history[])
- `version_metadata`, `version_history[]`
- `document_group_id`, `version_number`, `is_current_version`
- `tenant_id` (multi-tenancy)

### DocumentComment
- `document_id` → Document
- `user_id`, `user_name`, `user_email`
- `comment`, `status`
- `mentioned_users[]`
- `attachments[]`
- `tenant_id` (multi-tenancy)

### Notification
- `user_id`, `user_email`
- `title`, `message`, `type`, `priority`
- `document_id` → Document
- `comment_id` → DocumentComment
- `actor` (embedded: user_id, user_name, user_email)
- `is_read`, `read_at`
- `email_sent`, `email_status`
- `tenant_id` (multi-tenancy)

### UserSession
- `session_id` (unique)
- `user_id` → User
- `auth0_id`, `email`
- `tenant_id` → Tenant
- `csrf_token`
- `user_agent`, `ip_address`, `device_info`
- `device_fingerprint`
- `is_active`, `expires_at`

### AuditLog
- `action` (enum: create, read, update, delete, auth)
- `description`, `module`, `module_id` (polymorphic)
- `user` (embedded: id → User, name)
- `ip`, `agent`, `detail`
- `tenant_id` → Tenant
- `created_at`

---

## Multi-Tenancy

All tenant-scoped entities use the `tenantPlugin` which adds:
- `tenant_id` field (ObjectId reference to Tenant)
- Automatic tenant filtering in queries
- Tenant isolation enforcement

**Tenant-scoped entities:**
- Site, Building, Floor, BuildingTenant
- Asset, Vendor, Customer
- Document, DocumentComment
- Notification, User (via tenant_id in queries)

**Global entities (no tenant_id):**
- Tenant, Organization, Plan
- Role (permissions are global)
- UserSession (references tenant_id but not plugin-scoped)
- AuditLog (explicit tenant_id field)

---

## Indexes Summary

### Common Indexes
- Most entities: `tenant_id` (for multi-tenancy)
- Timestamps: `created_at`, `updated_at`
- Status fields: `is_active`, `status`
- Foreign keys: All relationship fields are indexed

### Key Compound Indexes
- **User**: `{ email: 1 }`, `{ role_ids: 1 }`, `{ 'resource_access.resource_type': 1 }`
- **Document**: `{ 'customer.customer_id': 1, category: 1 }`, `{ document_group_id: 1, version_sequence: -1 }`
- **BuildingTenant**: `{ tenant_id: 1, building_id: 1 }`, `{ building_id: 1, floor_id: 1 }`
- **Notification**: `{ user_id: 1, is_read: 1, created_at: -1 }`
- **AuditLog**: `{ tenant_id: 1, created_at: -1 }`, `{ 'user.id': 1, created_at: -1 }`
- **UserSession**: `{ user_id: 1, is_active: 1 }`, `{ expires_at: 1 }` (TTL)

---

## Version History

- **Created**: 2025-01-XX
- **Last Updated**: 2025-01-XX
- **Schema Version**: Based on current model definitions

---

## Notes

1. **Polymorphic Relationships**: Document uses embedded location objects instead of direct foreign keys for flexibility.

2. **Embedded Documents**: Many entities use embedded schemas (e.g., Document.file_meta, BuildingTenant.contacts, Vendor.licenses) for denormalized data access.

3. **Legacy Support**: Customer model is maintained for backward compatibility but Tenant/Organization is the preferred structure.

4. **Soft Deletes**: Some entities support soft deletes via `is_active` flag or `deleted_at` timestamp.

5. **Audit Trail**: All tenant-scoped entities have audit hooks that log changes to AuditLog.

6. **Version Management**: Documents support versioning via `document_group_id`, `version_number`, `is_current_version`, and `version_history[]`.


