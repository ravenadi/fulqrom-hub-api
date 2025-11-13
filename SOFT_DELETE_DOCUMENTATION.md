# Soft Delete & Cascade Delete Documentation

## Overview

The Fulqrom Hub API implements a comprehensive **soft delete** system with **automatic cascade deletion** for hierarchical resources. Instead of permanently removing records from the database, soft delete marks records as deleted (`is_delete: true`) while preserving data integrity and enabling potential recovery.

## Table of Contents

- [What is Soft Delete?](#what-is-soft-delete)
- [Resource Hierarchy](#resource-hierarchy)
- [DELETE API Endpoints](#delete-api-endpoints)
- [Cascade Delete Behavior](#cascade-delete-behavior)
- [S3 File Lifecycle Management](#s3-file-lifecycle-management)
- [Safety Features](#safety-features)
- [Implementation Details](#implementation-details)
- [Testing](#testing)

---

## What is Soft Delete?

**Soft delete** marks records as deleted without removing them from the database:

```javascript
// Instead of this (hard delete):
await Customer.deleteOne({ _id: customerId });

// We do this (soft delete):
await Customer.updateOne({ _id: customerId }, { is_delete: true });
```

### Benefits

1. **Data Recovery**: Deleted records can be restored if needed
2. **Audit Trail**: Complete history of deletions
3. **Referential Integrity**: Related records remain accessible
4. **Compliance**: Meet data retention requirements
5. **S3 File Management**: Files are tagged for automatic cleanup after 90 days

### Query Filtering

All GET endpoints automatically exclude soft-deleted records:

```javascript
// All list endpoints include this filter
filterQuery = {
  is_delete: { $ne: true }  // Exclude soft-deleted records
};
```

---

## Resource Hierarchy

The Fulqrom Hub follows this hierarchical structure:

```
Tenant
  └─ Customer
      └─ Site
          └─ Building
              ├─ Floor
              │   ├─ Asset
              │   └─ Building Tenant (occupant)
              ├─ Asset (building-level)
              └─ Building Tenant (building-level)
```

### Cascade Rules

When a parent resource is deleted, all child resources are automatically soft-deleted:

| Parent Deleted | Child Resources Soft-Deleted |
|---------------|------------------------------|
| **Customer** | Sites, Buildings, Floors, Assets, Building Tenants, Documents |
| **Site** | Buildings, Floors, Assets, Building Tenants, **Documents** |
| **Building** | Floors, Assets, Building Tenants, **Documents** |
| **Floor** | Assets, Building Tenants, **Documents** |

---

## DELETE API Endpoints

### Customer Delete

**Endpoint**: `DELETE /api/customers/:id`
**Location**: `routes/customers.js`
**Permission**: `customers:delete`

**Request:**
```bash
DELETE /api/customers/507f1f77bcf86cd799439011
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Customer deleted successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "organisation": {
      "organisation_name": "Acme Corporation"
    },
    "is_delete": true
  }
}
```

**Cascade Impact:**
- All Sites belonging to this customer
- All Buildings in those sites
- All Floors in those buildings
- All Assets in those buildings/floors
- All Building Tenants in those buildings/floors
- All Documents for this customer
- All S3 files tagged for 90-day expiry

---

### Site Delete

**Endpoint**: `DELETE /api/sites/:id`
**Location**: `routes/sites.js:680`
**Permission**: `sites:delete`

**Request:**
```bash
DELETE /api/sites/507f1f77bcf86cd799439012
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Site deleted successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "site_name": "Sydney CBD Office",
    "is_delete": true
  }
}
```

**Cascade Impact:**
- All Buildings at this site
- All Floors in those buildings
- All Assets in those buildings/floors
- All Building Tenants in those buildings/floors
- **All Documents for this site**
- All S3 files tagged for 90-day expiry

**Implementation:**
```javascript
// Soft delete site
await Site.findByIdAndUpdate(siteId, { is_delete: true });

// Cascade to children
const { cascadeSiteDelete } = require('../utils/softDeleteCascade');
await cascadeSiteDelete(siteId, tenantId);
```

---

### Building Delete

**Endpoint**: `DELETE /api/buildings/:id`
**Location**: `routes/buildings.js:789`
**Permission**: `buildings:delete`

**Request:**
```bash
DELETE /api/buildings/507f1f77bcf86cd799439013
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Building deleted successfully"
}
```

**Cascade Impact:**
- All Floors in this building
- All Assets in this building/floors
- All Building Tenants in this building/floors
- **All Documents for this building**
- All S3 files tagged for 90-day expiry

**Implementation:**
```javascript
// Soft delete building
await Building.findByIdAndUpdate(buildingId, { is_delete: true });

// Cascade to children
const { cascadeBuildingDelete } = require('../utils/softDeleteCascade');
await cascadeBuildingDelete(buildingId, tenantId);
```

---

### Floor Delete

**Endpoint**: `DELETE /api/floors/:id`
**Location**: `routes/floors.js`
**Permission**: `floors:delete`

**Request:**
```bash
DELETE /api/floors/507f1f77bcf86cd799439014
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Floor deleted successfully"
}
```

**Cascade Impact:**
- All Assets on this floor
- All Building Tenants on this floor
- **All Documents for this floor**
- All S3 files tagged for 90-day expiry

---

## Cascade Delete Behavior

### Customer Cascade Delete

**Function**: `cascadeCustomerDelete(customerId, tenantId)`
**Location**: `utils/softDeleteCascade.js:98`

**Process:**
1. Find all sites for this customer
2. For each site, call `cascadeSiteDelete()`
3. Soft delete all sites
4. Find all documents for this customer
5. Tag all document S3 files for expiry
6. Soft delete all documents

**Console Output:**
```
Cascading soft-delete for Customer 507f1f77bcf86cd799439011
  Found 3 sites to soft-delete
  Cascading soft-delete for Site 507f1f77bcf86cd799439012
    Found 5 buildings to soft-delete
    ...
  Soft-deleted 3 sites
  Tagged document S3 file for expiry: documents/customer-123/file.pdf
  Soft-deleted 47 documents
✓ Cascade completed for Customer 507f1f77bcf86cd799439011
```

---

### Site Cascade Delete

**Function**: `cascadeSiteDelete(siteId, tenantId)`
**Location**: `utils/softDeleteCascade.js:180`

**Process:**
1. Find all buildings for this site
2. For each building, call `cascadeBuildingDelete()`
3. Soft delete all buildings
4. Find all documents for this site
5. Tag all document S3 files for expiry
6. Soft delete all documents

**Console Output:**
```
  Cascading soft-delete for Site 507f1f77bcf86cd799439012
    Found 5 buildings to soft-delete
    Cascading soft-delete for Building 507f1f77bcf86cd799439013
      Found 12 floors to soft-delete
      ...
      Soft-deleted 45 assets
      Found 8 building tenants to soft-delete
    Soft-deleted 5 buildings
    Found 23 documents to soft-delete
    Tagged document S3 file for expiry: documents/site-123/file.pdf
    Soft-deleted 23 documents
```

---

### Building Cascade Delete

**Function**: `cascadeBuildingDelete(buildingId, tenantId)`
**Location**: `utils/softDeleteCascade.js:263`

**Process:**
1. Find all floors for this building
2. For each floor, call `cascadeFloorDelete()`
3. Soft delete all floors
4. Find all building-level assets
5. Tag all asset S3 files for expiry
6. Soft delete all building-level assets
7. Find all building tenants
8. Soft delete all building tenants
9. Find all documents for this building
10. Tag all document S3 files for expiry
11. Soft delete all documents

**Console Output:**
```
    Cascading soft-delete for Building 507f1f77bcf86cd799439013
      Found 12 floors to soft-delete
        Soft-deleted 8 assets on floor
        Soft-deleted 2 building tenants on floor
      Tagged asset S3 file for expiry: assets/building-123/asset-456/photo.jpg
      Soft-deleted 45 assets
      Found 8 building tenants to soft-delete
        Soft-deleted building tenant 507f1f77bcf86cd799439020
      Found 15 documents to soft-delete
      Tagged document S3 file for expiry: documents/building-123/file.pdf
      Soft-deleted 15 documents
```

---

### Floor Cascade Delete

**Function**: `cascadeFloorDelete(floorId, tenantId)`
**Location**: `utils/softDeleteCascade.js:395`

**Process:**
1. Find all assets on this floor
2. Tag all asset S3 files for expiry
3. Soft delete all assets on this floor
4. Soft delete all building tenants on this floor
5. Find all documents for this floor
6. Tag all document S3 files for expiry
7. Soft delete all documents

**Console Output:**
```
        Soft-deleted 8 assets on floor
        Soft-deleted 2 building tenants on floor
        Found 5 documents to soft-delete
        Tagged document S3 file for expiry: documents/floor-123/file.pdf
        Soft-deleted 5 documents
```

---

## S3 File Lifecycle Management

### Overview

When resources with S3 files are deleted, the files are **tagged for automatic expiry** instead of being immediately deleted. This provides a 90-day grace period for data recovery.

### S3 File Tagging

**Function**: `tagS3FileForExpiry(bucketName, s3Key)`
**Location**: `utils/softDeleteCascade.js:25`

**Tags Applied:**
```javascript
{
  TagSet: [
    {
      Key: 'Status',
      Value: 'SoftDeleted'
    },
    {
      Key: 'DeletedAt',
      Value: '2025-01-15T10:30:00.000Z'
    },
    {
      Key: 'ExpiryDays',
      Value: '90'
    }
  ]
}
```

### S3 Lifecycle Policy

S3 buckets are configured with lifecycle rules to automatically delete files tagged as `SoftDeleted` after 90 days:

```javascript
{
  Rules: [
    {
      Id: 'DeleteSoftDeletedFiles',
      Filter: {
        Tag: {
          Key: 'Status',
          Value: 'SoftDeleted'
        }
      },
      Status: 'Enabled',
      Expiration: {
        Days: 90
      }
    }
  ]
}
```

### Resources with S3 Files

The following resources may have S3 files that are tagged during cascade delete:

1. **Documents**:
   - `file.file_meta.bucket_name`
   - `file.file_meta.file_key` or `file.file_meta.file_path`

2. **Assets**:
   - `documents[].file_meta.bucket_name`
   - `documents[].file_meta.file_key` or `documents[].file_meta.file_path`

### S3 Tagging Process

**For Documents:**
```javascript
// Find documents to tag their S3 files before soft-deleting
const documents = await Document.find({
  'customer.customer_id': customerIdStr,
  tenant_id: tenantObjectId,
  is_delete: false
});

// Tag S3 files for expiry
for (const doc of documents) {
  if (doc.file && doc.file.file_meta) {
    const { bucket_name, file_key, file_path } = doc.file.file_meta;
    const s3Key = file_key || file_path;
    if (bucket_name && s3Key) {
      await tagS3FileForExpiry(bucket_name, s3Key);
      console.log(`Tagged document S3 file for expiry: ${s3Key}`);
    }
  }
}
```

**For Assets:**
```javascript
// Find and tag S3 files for assets
const floorAssets = await Asset.find({
  floor_id: floorObjectId,
  tenant_id: tenantObjectId,
  is_delete: false
});

await tagAssetsS3Files(floorAssets);
```

---

## Safety Features

### 1. Tenant Isolation

All delete operations enforce tenant isolation:

```javascript
// Users can only delete resources belonging to their tenant
const site = await Site.findOne({
  _id: siteId,
  tenant_id: tenantId  // Mandatory tenant check
});

if (!site) {
  return res.status(404).json({
    success: false,
    message: 'Site not found or you do not have permission to delete it'
  });
}
```

### 2. Permission Checks

All delete endpoints require proper permissions:

```javascript
// Resource-specific permission check
router.delete('/:id',
  checkResourcePermission('site', 'delete', (req) => req.params.id),
  tenantContext,
  async (req, res) => { /* ... */ }
);
```

**Permission Types:**
- **Role-based**: User's role has `sites:delete` permission
- **Resource-specific**: User has explicit access to this specific site

### 3. Already-Deleted Check

Prevents duplicate soft-delete operations:

```javascript
// Check if already deleted
if (site.is_delete) {
  return res.status(400).json({
    success: false,
    message: 'Site already deleted'
  });
}
```

### 4. Audit Logging

All delete operations are logged:

```javascript
// Log audit for site deletion
logDelete({
  module: 'site',
  resourceName: site.site_name,
  req,
  moduleId: site._id,
  resource: site.toObject()
});
```

**Audit Log Entry:**
```json
{
  "action": "DELETE",
  "module": "site",
  "resource_id": "507f1f77bcf86cd799439012",
  "resource_name": "Sydney CBD Office",
  "user_id": "507f1f77bcf86cd799439001",
  "tenant_id": "507f1f77bcf86cd799439000",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "ip_address": "203.0.113.42"
}
```

### 5. Transaction Support (for Customer Delete)

Customer delete uses MongoDB transactions for atomicity:

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Perform cascade delete operations
  await cascadeCustomerDelete(customerId, tenantId);

  // Commit transaction
  await session.commitTransaction();
} catch (error) {
  // Rollback on error
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### 6. Error Handling

Comprehensive error handling with detailed logging:

```javascript
try {
  await cascadeSiteDelete(siteId, tenantId);
} catch (error) {
  console.error(`❌ Error cascading delete for Site ${siteId}:`, error);
  throw error;
}
```

---

## Implementation Details

### File Structure

```
rest-api/
├── routes/
│   ├── customers.js       # Customer DELETE endpoint
│   ├── sites.js           # Site DELETE endpoint (line 680)
│   ├── buildings.js       # Building DELETE endpoint (line 789)
│   └── floors.js          # Floor DELETE endpoint
├── utils/
│   └── softDeleteCascade.js  # Cascade delete functions
└── models/
    ├── Customer.js
    ├── Site.js
    ├── Building.js
    ├── Floor.js
    ├── Asset.js
    ├── BuildingTenant.js
    └── Document.js
```

### Cascade Function Exports

```javascript
// utils/softDeleteCascade.js
module.exports = {
  cascadeCustomerDelete,
  cascadeSiteDelete,
  cascadeBuildingDelete,
  cascadeFloorDelete
};
```

### Usage in Routes

```javascript
const { cascadeSiteDelete } = require('../utils/softDeleteCascade');

router.delete('/:id', async (req, res) => {
  // Soft delete site
  await Site.findByIdAndUpdate(req.params.id, { is_delete: true });

  // Cascade to children
  await cascadeSiteDelete(req.params.id, tenantId);

  // Log and respond
  logDelete({ /* ... */ });
  res.status(200).json({ success: true });
});
```

---

## Testing

### Manual Testing

**Test Customer Cascade Delete:**
```bash
# 1. Create test hierarchy
POST /api/customers
POST /api/sites (with customer_id)
POST /api/buildings (with site_id)
POST /api/floors (with building_id)
POST /api/assets (with floor_id)

# 2. Delete customer
DELETE /api/customers/{customer_id}

# 3. Verify cascade
GET /api/sites?customer_id={customer_id}  # Should return 0 results
GET /api/buildings?customer_id={customer_id}  # Should return 0 results
GET /api/floors?customer_id={customer_id}  # Should return 0 results
GET /api/assets?customer_id={customer_id}  # Should return 0 results

# 4. Check database (should still exist with is_delete: true)
# Connect to MongoDB and verify records exist but are marked deleted
```

**Test Site Cascade Delete:**
```bash
# 1. Delete site
DELETE /api/sites/{site_id}

# 2. Verify cascade
GET /api/buildings?site_id={site_id}  # Should return 0 results
GET /api/floors?site_id={site_id}  # Should return 0 results
GET /api/assets?site_id={site_id}  # Should return 0 results
```

**Test Building Cascade Delete:**
```bash
# 1. Delete building
DELETE /api/buildings/{building_id}

# 2. Verify cascade
GET /api/floors?building_id={building_id}  # Should return 0 results
GET /api/assets?building_id={building_id}  # Should return 0 results
```

### Test Cases

**✅ Test: Soft Delete Site**
```javascript
// GIVEN: A site with 3 buildings
// WHEN: Site is deleted
// THEN:
// - Site.is_delete = true
// - All 3 buildings have is_delete = true
// - All floors in those buildings have is_delete = true
// - All assets in those buildings have is_delete = true
// - GET /api/sites returns 0 results for this site
// - Database still contains all records
```

**✅ Test: Already Deleted Check**
```javascript
// GIVEN: A site that is already soft-deleted
// WHEN: DELETE /api/sites/{site_id} is called again
// THEN: 400 Bad Request "Site already deleted"
```

**✅ Test: Tenant Isolation**
```javascript
// GIVEN: User from Tenant A
// WHEN: User tries to delete site from Tenant B
// THEN: 404 Not Found (site not visible to user)
```

**✅ Test: Permission Check**
```javascript
// GIVEN: User without sites:delete permission
// WHEN: DELETE /api/sites/{site_id} is called
// THEN: 403 Forbidden
```

**✅ Test: S3 File Tagging**
```javascript
// GIVEN: Asset with attached S3 files
// WHEN: Asset is soft-deleted (via building cascade)
// THEN:
// - Asset.is_delete = true
// - S3 files tagged with Status=SoftDeleted
// - S3 files tagged with DeletedAt timestamp
// - S3 files tagged with ExpiryDays=90
```

### Automated Test Example

```javascript
const request = require('supertest');
const app = require('../app');
const Site = require('../models/Site');
const Building = require('../models/Building');

describe('Site Soft Delete', () => {
  it('should soft delete site and cascade to buildings', async () => {
    // Arrange
    const site = await Site.create({ site_name: 'Test Site', tenant_id: 'tenant1' });
    const building = await Building.create({
      building_name: 'Test Building',
      site_id: site._id,
      tenant_id: 'tenant1'
    });

    // Act
    const response = await request(app)
      .delete(`/api/sites/${site._id}`)
      .set('Authorization', 'Bearer {token}');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const deletedSite = await Site.findById(site._id);
    expect(deletedSite.is_delete).toBe(true);

    const deletedBuilding = await Building.findById(building._id);
    expect(deletedBuilding.is_delete).toBe(true);
  });
});
```

---

## Best Practices

### 1. Always Use Soft Delete

Never use hard delete operations:

```javascript
// ❌ DON'T DO THIS
await Site.deleteOne({ _id: siteId });

// ✅ DO THIS
await Site.findByIdAndUpdate(siteId, { is_delete: true });
await cascadeSiteDelete(siteId, tenantId);
```

### 2. Always Check Tenant Context

```javascript
// ✅ Always verify tenant ownership
const site = await Site.findOne({
  _id: siteId,
  tenant_id: tenantId
});

if (!site) {
  return res.status(404).json({
    success: false,
    message: 'Site not found'
  });
}
```

### 3. Always Log Deletions

```javascript
// ✅ Always log audit trail
logDelete({
  module: 'site',
  resourceName: site.site_name,
  req,
  moduleId: site._id,
  resource: site.toObject()
});
```

### 4. Handle S3 Files Properly

```javascript
// ✅ Tag S3 files for expiry, don't delete immediately
await tagS3FileForExpiry(bucketName, s3Key);

// This allows 90-day grace period for recovery
```

### 5. Use Cascade Functions

```javascript
// ✅ Always use provided cascade functions
const { cascadeSiteDelete } = require('../utils/softDeleteCascade');
await cascadeSiteDelete(siteId, tenantId);

// Don't implement cascade logic manually
```

---

## FAQ

### Q: Can soft-deleted records be restored?

**A:** Yes, soft-deleted records can be restored by setting `is_delete: false`. However, you'll need to implement a restore endpoint and handle S3 file restoration separately.

### Q: What happens to S3 files after 90 days?

**A:** S3 lifecycle policies automatically delete files tagged with `Status=SoftDeleted` after 90 days. This is handled by AWS S3, not the application.

### Q: Can I hard delete records immediately?

**A:** Not recommended. Hard delete would break referential integrity and lose audit trail. If you must hard delete, implement a separate cleanup job that removes records after a retention period.

### Q: What if cascade delete fails midway?

**A:** The cascade functions continue even if individual operations fail, but errors are logged. For critical operations like customer delete, consider wrapping in MongoDB transactions for atomicity.

### Q: Are soft-deleted records counted in statistics?

**A:** No. All queries automatically exclude soft-deleted records using `is_delete: { $ne: true }` filter.

### Q: Can I query soft-deleted records?

**A:** Yes, by explicitly including them in your query:

```javascript
// Include soft-deleted records
const allSites = await Site.find({
  tenant_id: tenantId
  // No is_delete filter
});

// Only soft-deleted records
const deletedSites = await Site.find({
  tenant_id: tenantId,
  is_delete: true
});
```

---

## Related Documentation

- [S3 Implementation Summary](./S3_IMPLEMENTATION_SUMMARY.md) - S3 bucket lifecycle policies
- [API Documentation](./API_DOCS.md) - Complete API endpoint reference
- [Authorization Guide](./AUTHORIZATION_IMPLEMENTATION_GUIDE.md) - Permission system
- [Audit Logging](./AUDIT_LOGGING_COMPLETE.md) - Audit trail implementation

---

## Summary

The Fulqrom Hub API implements a robust soft delete system with:

✅ **Automatic cascade deletion** for hierarchical resources
✅ **S3 file lifecycle management** (90-day grace period)
✅ **Tenant isolation** and security
✅ **Permission-based access control**
✅ **Comprehensive audit logging**
✅ **Already-deleted checks**
✅ **Transaction support** for critical operations
✅ **Detailed error handling and logging**

This ensures data integrity, compliance, and potential recovery while maintaining clean query results.
