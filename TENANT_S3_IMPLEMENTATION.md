# Tenant S3 Bucket Implementation

## Overview
Tenant-specific S3 bucket management with automatic creation on tenant provisioning and 90-day auto-deletion on tenant removal.

## Features Implemented

### 1. S3 Bucket Creation (Automatic)
**Endpoint**: `POST /api/super-admin/tenants`

**What Happens**:
- Creates tenant in database
- Creates dedicated S3 bucket: `fulqrom-hub-{tenant-name}-{tenant-id}`
- Stores bucket metadata in tenant record (`s3_bucket_name`, `s3_bucket_region`, `s3_bucket_status`)
- Gracefully handles failures (tenant creation succeeds even if S3 fails)

**Files**:
- `controllers/superAdminTenantsController.js:321-361`
- `services/tenantS3Service.js`
- `models/Tenant.js:73-89`

### 2. S3 Bucket Deletion (90-Day Auto-Expiry)
**Endpoint**: `DELETE /api/super-admin/tenants/:id`

**Default Behavior** (Safe):
```bash
DELETE /api/super-admin/tenants/:id
```
- Deletes all tenant data from database (14 record types)
- **Marks S3 bucket for 90-day auto-deletion** (not immediate)
- Sets AWS lifecycle policy to expire all objects after 90 days
- Tags bucket: `Status=PendingDeletion`, `DeletionDate=<date>`

**Immediate Deletion** (Permanent):
```bash
DELETE /api/super-admin/tenants/:id?immediate_s3_delete=true
```
- Immediately deletes bucket and all files
- No recovery possible

**Files**:
- `controllers/superAdminTenantsController.js:258-331`
- `services/tenantDeletionService.js`

### 3. Document Uploads (Tenant-Specific Buckets)
**Endpoint**: `POST /api/documents`

**What Happens**:
- Retrieves `tenant_id` from authenticated user
- Queries tenant record for `s3_bucket_name`
- Uploads to tenant-specific bucket if available
- Falls back to shared bucket if tenant bucket unavailable

**Files**:
- `routes/documents.js:648-701`

## Database Schema

**Tenant Model Fields**:
```javascript
s3_bucket_name: String      // "fulqrom-hub-gkb-labs-67xxx"
s3_bucket_region: String    // "ap-southeast-2"
s3_bucket_status: String    // "created" | "pending" | "failed" | "not_created"
```

## API Examples

### Create Tenant
```bash
POST /api/super-admin/tenants
{
  "name": "GKB Labs Pty Ltd",
  "phone": "+61400000000",
  "status": "trial"
}

# Response includes S3 bucket info
{
  "success": true,
  "data": {
    "id": "67xxx",
    "name": "GKB Labs Pty Ltd",
    "s3_bucket": {
      "bucket_name": "fulqrom-hub-gkb-labs-pty-ltd-67xxx",
      "status": "created",
      "success": true
    }
  }
}
```

### Delete Tenant (Default: 90-Day Auto-Deletion)
```bash
DELETE /api/super-admin/tenants/67xxx

# Response
{
  "success": true,
  "data": {
    "s3_deletion_type": "marked_for_auto_deletion",
    "s3_deletion_date": "2026-01-20T00:00:00.000Z",
    "s3_days_until_deletion": 90,
    "database_records_deleted": {
      "documents": 5,
      "users": 3,
      "customers": 1,
      ...
    }
  }
}
```

### Delete Tenant (Immediate)
```bash
DELETE /api/super-admin/tenants/67xxx?immediate_s3_delete=true
```

## Deletion Process (Sequential)

1. Document Comments
2. Approval History
3. **Documents** (+ S3 file cleanup)
4. Assets
5. Floors
6. Buildings
7. Sites
8. Customers
9. Vendors
10. Email Notifications
11. Notifications
12. Settings
13. Users
14. Audit Logs
15. Tenant Record
16. **S3 Bucket** (90-day expiry or immediate)

## AWS S3 Lifecycle Policy (Auto-Deletion)

When tenant deleted with default settings:
```json
{
  "Rules": [{
    "ID": "DeleteTenantBucketAfter90Days",
    "Status": "Enabled",
    "Expiration": { "Days": 90 },
    "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
  }]
}
```

**Bucket Tags**:
- `Status: PendingDeletion`
- `DeletionScheduled: true`
- `DeletionDate: 2026-01-20T00:00:00.000Z`
- `DeletedAt: 2025-10-23T00:00:00.000Z`

## Testing

**Automated Test**:
```bash
cd rest-api
node tests/tenant-deletion.test.js
```

**Manual Test**:
```bash
# 1. Create tenant
POST /api/super-admin/tenants
{
  "name": "Test Company",
  "status": "trial"
}

# 2. Verify S3 bucket created
# Check response includes s3_bucket.bucket_name

# 3. Delete tenant
DELETE /api/super-admin/tenants/{id}

# 4. Verify lifecycle policy
aws s3api get-bucket-lifecycle-configuration --bucket {bucket_name}
```

## Key Files

| File | Purpose |
|------|---------|
| `controllers/superAdminTenantsController.js` | Tenant CRUD + S3 integration |
| `services/tenantDeletionService.js` | Comprehensive deletion logic |
| `services/tenantS3Service.js` | S3 bucket management |
| `models/Tenant.js` | Tenant model with S3 fields |
| `routes/documents.js` | Document upload with tenant buckets |
| `tests/tenant-deletion.test.js` | Automated test suite |

## AWS Permissions Required

```json
{
  "Action": [
    "s3:CreateBucket",
    "s3:DeleteBucket",
    "s3:PutLifecycleConfiguration",
    "s3:GetLifecycleConfiguration",
    "s3:PutBucketTagging",
    "s3:GetBucketTagging",
    "s3:PutObject",
    "s3:GetObject",
    "s3:DeleteObject"
  ],
  "Resource": [
    "arn:aws:s3:::fulqrom-hub-*",
    "arn:aws:s3:::fulqrom-hub-*/*"
  ]
}
```

## Benefits

✅ **Data Isolation** - Each tenant has dedicated S3 bucket
✅ **Safe Deletion** - 90-day recovery window (default)
✅ **Cost Optimization** - AWS auto-deletes after expiry
✅ **Graceful Fallback** - System works if tenant bucket unavailable
✅ **Audit Trail** - All operations logged with tenant_id
✅ **Zero Downtime** - Tenant creation succeeds even if S3 fails

## Notes

- Default deletion: **90-day auto-expiry** (safer, allows recovery)
- Immediate deletion: Use `?immediate_s3_delete=true` (permanent)
- Bucket naming: `fulqrom-hub-{sanitized-name}-{tenant-id}`
- Document uploads: Automatically use tenant bucket when available
- Audit logs: All operations include `tenant_id` field
