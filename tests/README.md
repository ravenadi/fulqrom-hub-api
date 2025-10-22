# Tenant Deletion Test Suite

Comprehensive test suite for verifying tenant deletion functionality, including S3 bucket management, audit logging, and cascade deletion.

## Test Coverage

### 1. Tenant Creation with S3 Bucket
- ✅ Creates tenant in database
- ✅ Creates tenant-specific S3 bucket in AWS
- ✅ Stores S3 bucket metadata in database (`s3_bucket_name`, `s3_bucket_region`, `s3_bucket_status`)
- ✅ Verifies bucket exists in AWS

### 2. S3 Bucket Integration
- ✅ Tenant-specific bucket naming: `fulqrom-hub-{tenant_name}-{tenant_id}`
- ✅ Bucket configuration with CORS, versioning, and lifecycle policies
- ✅ Document uploads use tenant-specific bucket
- ✅ Graceful fallback to shared bucket if tenant bucket unavailable

### 3. Comprehensive Tenant Deletion
- ✅ Sequential deletion of all dependent records:
  - Document Comments
  - Approval History
  - Documents (with S3 file cleanup)
  - Assets
  - Floors
  - Buildings
  - Sites
  - Customers
  - Vendors
  - Email Notifications
  - Notifications
  - Settings
  - Users
  - Audit Logs
  - Tenant record

### 4. S3 Auto-Deletion (90-Day Expiry)
- ✅ Marks bucket for deletion instead of immediate removal
- ✅ Sets AWS S3 Lifecycle Policy to expire all objects after 90 days
- ✅ Tags bucket with deletion metadata:
  - `Status: PendingDeletion`
  - `DeletionScheduled: true`
  - `DeletionDate: <ISO timestamp>`
  - `DeletedAt: <ISO timestamp>`
- ✅ Verifies lifecycle policy configuration

### 5. Audit Log Validation
- ✅ All tenant operations include `tenant_id` in audit logs
- ✅ Audit log created for tenant deletion (optional)
- ✅ Prevents "AuditLog validation failed" errors

## Running Tests

### Automated Test Script

```bash
# From rest-api directory
node tests/tenant-deletion.test.js
```

This automated script will:
1. Connect to MongoDB
2. Create a test tenant with S3 bucket
3. Verify S3 bucket exists and metadata is stored
4. Delete the tenant using comprehensive deletion service
5. Verify lifecycle policy and bucket tags
6. Display detailed test results

### Manual Testing via API

#### 1. Create Tenant (Super Admin)

```bash
POST http://localhost:30001/api/super-admin/tenants
Authorization: Bearer {super_admin_token}
Content-Type: application/json

{
  "tenant_name": "Test Company Pty Ltd",
  "phone": "+61400000000",
  "status": "trial",
  "plan_id": null
}
```

Expected Response:
```json
{
  "success": true,
  "message": "Tenant created successfully",
  "tenant": {
    "_id": "67xxxxxxxxxxxxx",
    "tenant_name": "Test Company Pty Ltd",
    "s3_bucket_name": "fulqrom-hub-test-company-pty-ltd-67xxxxxxxxxxxxx",
    "s3_bucket_region": "ap-southeast-2",
    "s3_bucket_status": "created",
    "status": "trial"
  }
}
```

#### 2. Verify S3 Bucket in Database

```bash
GET http://localhost:30001/api/super-admin/tenants/{tenant_id}
Authorization: Bearer {super_admin_token}
```

Check response includes:
- `s3_bucket_name`: Should be present
- `s3_bucket_status`: Should be "created"
- `s3_bucket_region`: Should be "ap-southeast-2"

#### 3. Upload Document (Tenant User)

```bash
POST http://localhost:30001/api/documents
Authorization: Bearer {tenant_user_token}
Content-Type: multipart/form-data

{
  "file": <binary file>,
  "customer_id": "{customer_id}",
  "title": "Test Document",
  "category": "contract"
}
```

Expected: File should be uploaded to tenant-specific S3 bucket.

Console should show:
```
📦 Using tenant-specific S3 bucket: fulqrom-hub-test-company-pty-ltd-67xxxxxxxxxxxxx
✅ File uploaded to tenant bucket successfully
```

#### 4. Delete Tenant (Default: 90-Day Auto-Deletion)

```bash
DELETE http://localhost:30001/api/super-admin/tenants/{tenant_id}
Authorization: Bearer {super_admin_token}
```

Expected Response:
```json
{
  "success": true,
  "message": "Tenant deleted successfully with all dependencies",
  "deletion_counts": {
    "document_comments": 0,
    "approval_history": 0,
    "documents": 5,
    "assets": 10,
    "floors": 3,
    "buildings": 2,
    "sites": 1,
    "customers": 1,
    "vendors": 2,
    "email_notifications": 0,
    "notifications": 15,
    "settings": 1,
    "users": 3,
    "audit_logs": 25,
    "tenant": 1
  },
  "s3_status": {
    "deletion_type": "marked_for_auto_deletion",
    "auto_deletion_scheduled": true,
    "deletion_date": "2026-01-20T10:00:00.000Z",
    "bucket_name": "fulqrom-hub-test-company-pty-ltd-67xxxxxxxxxxxxx"
  }
}
```

#### 5. Delete Tenant (Immediate S3 Deletion)

```bash
DELETE http://localhost:30001/api/super-admin/tenants/{tenant_id}?immediate_s3_delete=true
Authorization: Bearer {super_admin_token}
```

Use this only when you're absolutely sure you want to immediately delete all S3 files.

### Verify S3 Bucket Lifecycle Policy (AWS CLI)

```bash
# Check lifecycle configuration
aws s3api get-bucket-lifecycle-configuration \
  --bucket fulqrom-hub-test-company-pty-ltd-67xxxxxxxxxxxxx

# Check bucket tags
aws s3api get-bucket-tagging \
  --bucket fulqrom-hub-test-company-pty-ltd-67xxxxxxxxxxxxx
```

Expected Lifecycle Policy:
```json
{
  "Rules": [
    {
      "ID": "DeleteTenantBucketAfter90Days",
      "Status": "Enabled",
      "Filter": {},
      "Expiration": {
        "Days": 90
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      },
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 1
      }
    }
  ]
}
```

Expected Tags:
```json
{
  "TagSet": [
    { "Key": "Status", "Value": "PendingDeletion" },
    { "Key": "DeletionScheduled", "Value": "true" },
    { "Key": "DeletionDate", "Value": "2026-01-20T10:00:00.000Z" },
    { "Key": "DeletedAt", "Value": "2025-10-22T10:00:00.000Z" },
    { "Key": "TenantId", "Value": "67xxxxxxxxxxxxx" },
    { "Key": "TenantName", "Value": "Test Company Pty Ltd" }
  ]
}
```

## Test Scenarios

### Scenario 1: Standard Tenant Lifecycle
1. Create tenant → S3 bucket created and stored
2. Users upload documents → Files go to tenant bucket
3. Tenant deleted → 90-day auto-deletion scheduled
4. After 90 days → AWS automatically deletes bucket and all contents

### Scenario 2: Immediate Deletion Required
1. Create tenant → S3 bucket created
2. Tenant deleted with `?immediate_s3_delete=true`
3. S3 bucket and all files immediately deleted

### Scenario 3: Tenant Bucket Unavailable
1. Create tenant → S3 bucket creation fails
2. Users upload documents → Gracefully falls back to shared bucket
3. System continues working without errors

### Scenario 4: Audit Log Validation
1. Any tenant operation → Audit log created with `tenant_id`
2. Prevents "AuditLog validation failed: tenant_id: Path `tenant_id` is required." error

## Expected Behavior

### S3 Bucket Naming Convention
```
fulqrom-hub-{sanitized_tenant_name}-{tenant_id}

Example:
fulqrom-hub-gkb-labs-pty-ltd-67xxxxxxxxxxxxx
```

### Deletion Statistics

When a tenant is deleted, you should see counts for all deleted records:
```javascript
{
  document_comments: 0,
  approval_history: 0,
  documents: 5,        // Includes S3 file cleanup
  assets: 10,
  floors: 3,
  buildings: 2,
  sites: 1,
  customers: 1,
  vendors: 2,
  email_notifications: 0,
  notifications: 15,
  settings: 1,
  users: 3,
  audit_logs: 25,      // Historical audit trail
  tenant: 1
}
```

## Implementation Files

### Core Files
- `/rest-api/controllers/superAdminTenantsController.js` - Tenant CRUD with S3 integration
- `/rest-api/services/tenantDeletionService.js` - Comprehensive deletion logic
- `/rest-api/services/tenantS3Service.js` - S3 bucket management
- `/rest-api/models/Tenant.js` - Tenant model with S3 fields
- `/rest-api/routes/documents.js` - Document upload with tenant bucket support

### Key Functions

#### `createTenant()` (superAdminTenantsController.js:290-350)
Creates tenant and S3 bucket, stores bucket metadata.

#### `deleteTenant()` (superAdminTenantsController.js:664-761)
Orchestrates comprehensive tenant deletion.

#### `deleteTenantCompletely()` (tenantDeletionService.js:189-301)
Executes sequential deletion of all dependencies.

#### `markS3BucketForDeletion()` (tenantDeletionService.js:80-187)
Configures 90-day lifecycle policy and deletion tags.

#### Document Upload (documents.js:648-701)
Uses tenant-specific bucket with fallback to shared bucket.

## Troubleshooting

### Test Fails: "AuditLog validation failed"
**Solution**: Ensure all audit log creations include `tenant_id` field.

### Test Fails: "S3 bucket not found"
**Solution**: Check AWS credentials and permissions. Ensure bucket naming follows AWS rules.

### Test Fails: "Document upload failed"
**Solution**: Check tenant has valid `s3_bucket_name` in database. System should fallback to shared bucket gracefully.

### Lifecycle Policy Not Applied
**Solution**: Check AWS IAM permissions include `s3:PutLifecycleConfiguration` and `s3:PutBucketTagging`.

## AWS Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketCORS",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:PutBucketTagging",
        "s3:GetBucketTagging",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucketVersions",
        "s3:DeleteObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::fulqrom-hub-*",
        "arn:aws:s3:::fulqrom-hub-*/*"
      ]
    }
  ]
}
```

## Success Criteria

✅ **Tenant Creation**
- Tenant created in database
- S3 bucket created in AWS
- Bucket metadata stored in database

✅ **Document Uploads**
- Files uploaded to tenant-specific bucket
- Console shows "Using tenant-specific S3 bucket"

✅ **Tenant Deletion**
- All dependent records deleted in correct order
- Deletion counts returned
- No orphaned records remain

✅ **S3 Auto-Deletion**
- Bucket NOT immediately deleted
- Lifecycle policy configured for 90-day expiry
- Bucket tagged with deletion metadata
- Bucket status changes to "PendingDeletion"

✅ **Audit Logging**
- All operations create audit logs with `tenant_id`
- No "tenant_id required" validation errors

## Next Steps

1. **Run Automated Test**: `node tests/tenant-deletion.test.js`
2. **Review Results**: Check all test sections pass
3. **Manual Verification**: Test via API endpoints
4. **AWS Verification**: Check lifecycle policy and tags in AWS Console or CLI

## Notes

- Default behavior is 90-day auto-deletion (safer, allows recovery)
- Immediate deletion available via `?immediate_s3_delete=true` query parameter
- Graceful fallback ensures system works even if tenant bucket unavailable
- All deletions are logged in audit trail (unless final audit log skipped for tests)
